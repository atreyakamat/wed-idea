-- Platform admin.
--
-- * Platform admin powers need two-step sign-in: is_admin() is true only for
--   rows in admin_users AND a session at assurance level aal2 (password plus
--   authenticator app) AND that admin's registered authenticator still
--   existing. Authenticator setup is only open for a short window after an
--   admin is added in SQL, so a stolen password can't enrol its own.
-- * Studios get a status (trialing, active, past_due, suspended) and a trial
--   end date. Only the admin functions below change them, and every change is
--   written to admin_audit_log in the same transaction.
-- * A suspended studio can't create events, go live, add or change guests and
--   photos, upload files, move events to another studio, or open a new
--   studio. Guests' existing galleries stay up: they did nothing wrong.
-- * Admin screens read through security-definer functions that check
--   is_admin() first, because they need cross-studio totals, member emails
--   (auth.users) and storage usage (storage.objects).

-- ---------------------------------------------------------------------------
-- Admin powers need MFA
-- ---------------------------------------------------------------------------

-- The authenticator registered through the app's setup flow, and how long
-- setup stays open. A new admin row opens setup for one hour.
alter table public.admin_users
  add column mfa_factor_id   uuid,
  add column mfa_setup_until timestamptz default (now() + interval '1 hour');

-- Admins that already exist don't get a surprise setup window at deploy
-- time; reopen it by hand (see README) when needed.
update public.admin_users set mfa_setup_until = null;

-- Opening setup (adding an admin, or resetting one) removes any
-- authenticators already on the account, so one planted earlier with a
-- stolen password can't be registered.
create or replace function public.clear_admin_factors_on_setup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mfa_factor_id is null and new.mfa_setup_until is not null
     and (tg_op = 'INSERT' or new.mfa_setup_until is distinct from old.mfa_setup_until) then
    delete from auth.mfa_factors where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_admin_factors_on_setup() from public, anon, authenticated;

create trigger admin_users_fresh_setup
  before insert or update on public.admin_users
  for each row execute function public.clear_admin_factors_on_setup();

-- Admin needs: an aal2 session, whose second step used this admin's
-- registered authenticator, which still exists and is verified.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and exists (
       select 1
       from public.admin_users a
       join auth.mfa_factors f on f.id = a.mfa_factor_id and f.user_id = a.user_id and f.status = 'verified'
       join auth.sessions s on s.user_id = a.user_id and s.factor_id = a.mfa_factor_id
       where a.user_id = (select auth.uid())
         and s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
     );
$$;

-- ---------------------------------------------------------------------------
-- Studio status
-- ---------------------------------------------------------------------------

create type public.studio_status as enum ('trialing', 'active', 'past_due', 'suspended');

alter table public.organizations
  add column status           public.studio_status not null default 'trialing',
  add column trial_ends_at    timestamptz not null default (now() + interval '14 days'),
  add column suspended_at     timestamptz,
  add column suspended_reason text check (char_length(suspended_reason) <= 500),
  add constraint organizations_suspension_consistent check (
    (status = 'suspended') = (suspended_at is not null)
  );

create index organizations_status_idx on public.organizations (status);

-- Studio managers can still rename their studio, but status and trial fields
-- only change through the admin functions (which run as the function owner,
-- not as "authenticated"), so every change is audited.
create or replace function public.guard_studio_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.status, new.trial_ends_at, new.suspended_at, new.suspended_reason)
         is distinct from (old.status, old.trial_ends_at, old.suspended_at, old.suspended_reason) then
    raise exception 'Only platform admins can change a studio''s status or trial'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_guard_status
  before update on public.organizations
  for each row execute function public.guard_studio_status();

-- Answers only for studios the caller belongs to (false otherwise), so it
-- can't be used to probe other studios.
create or replace function public.is_studio_suspended(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizations
    where id = org and status = 'suspended' and public.is_org_member(org)
  );
$$;

revoke all on function public.is_studio_suspended(uuid) from public, anon;
grant execute on function public.is_studio_suspended(uuid) to authenticated;

-- Suspended studios can't start new work. Admins and server-side code
-- (service role) are not blocked, so support can still fix things.
create or replace function public.block_suspended_studio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org uuid;
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  -- Hiding a photo (for example when a guest asks) is always allowed.
  if tg_table_name = 'photos' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'deleted_at') = (to_jsonb(old) - 'deleted_at') then
    return new;
  end if;

  if tg_table_name = 'events' then
    -- Editing an event is fine; creating one or going live is not.
    if tg_op = 'UPDATE' and not (new.status = 'live' and old.status is distinct from 'live') then
      return new;
    end if;
    org := new.organization_id;
  else
    select e.organization_id into org from public.events e where e.id = new.event_id;
  end if;

  if public.is_studio_suspended(org) then
    raise exception 'This studio is suspended. Contact support to reactivate it.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_block_suspended
  before insert or update of status on public.events
  for each row execute function public.block_suspended_studio();

create trigger guests_block_suspended
  before insert or update on public.guests
  for each row execute function public.block_suspended_studio();

create trigger photos_block_suspended
  before insert or update on public.photos
  for each row execute function public.block_suspended_studio();

-- Events never move between studios through the API. Otherwise a suspended
-- studio could move a live event into a fresh studio and keep capturing.
create or replace function public.keep_event_studio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and new.organization_id is distinct from old.organization_id then
    raise exception 'Events can''t be moved to another studio' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger events_keep_studio
  before update of organization_id on public.events
  for each row execute function public.keep_event_studio();

-- One studio per account (the app assumes it), and none while you belong to
-- a suspended studio. Same behaviour as before otherwise.
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org_id uuid;
begin
  if uid is null then
    raise exception 'Sign in to create a studio' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = uid and o.status = 'suspended'
  ) then
    raise exception 'This studio is suspended. Contact support to reactivate it.' using errcode = '42501';
  end if;

  if exists (select 1 from public.organization_members where user_id = uid and role = 'owner') then
    raise exception 'You already have a studio';
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_name), p_slug)
  returning id into org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (org_id, uid, 'owner');

  return org_id;
end;
$$;

-- Storage: members keep reading and deleting their files, but a suspended
-- studio can't upload or overwrite any.
drop policy "members manage their studio's photos" on storage.objects;

create policy "members read their studio's photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))));

create policy "members delete their studio's photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))));

create policy "active members upload photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and not (select public.is_studio_suspended(public.storage_path_org(name)))
  );

create policy "active members replace photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))))
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and not (select public.is_studio_suspended(public.storage_path_org(name)))
  );

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

-- No foreign keys on purpose: deleting a studio or a user must never
-- rewrite history. Names are copied in at the time of the change.
create table public.admin_audit_log (
  id               bigint generated always as identity primary key,
  actor_id         uuid,
  actor_email      text,
  action           text not null check (char_length(action) between 1 and 60),
  organization_id  uuid,
  studio_name      text,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_organization_idx on public.admin_audit_log (organization_id, created_at desc);

alter table public.admin_audit_log enable row level security;

-- Read-only for admins. Rows are written only by the admin functions, and
-- nobody can edit or delete them through the API.
create policy "admins read audit log"
  on public.admin_audit_log for select
  to authenticated
  using ((select public.is_admin()));

create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Platform admins only' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_admin() from public, anon, authenticated;

-- Writes one audit row, copying the admin's email and the studio's name.
create or replace function public.write_audit(p_action text, p_org uuid, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (actor_id, actor_email, action, organization_id, studio_name, details)
  values (
    (select auth.uid()),
    (select email from auth.users where id = (select auth.uid())),
    p_action,
    p_org,
    (select name from public.organizations where id = p_org),
    p_details
  );
$$;

revoke all on function public.write_audit(text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_studio_status(
  p_org uuid,
  p_status public.studio_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.studio_status;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();

  if p_status = 'suspended' and reason is null then
    raise exception 'Give a reason for suspending the studio' using errcode = '22023';
  end if;
  if char_length(reason) > 500 then
    raise exception 'Keep the reason under 500 characters' using errcode = '22023';
  end if;

  select status into previous from public.organizations where id = p_org for update;
  if not found then
    raise exception 'Studio not found' using errcode = 'P0002';
  end if;
  if previous = p_status then
    return;
  end if;

  update public.organizations
  set status = p_status,
      suspended_at = case when p_status = 'suspended' then now() end,
      suspended_reason = case when p_status = 'suspended' then reason end
  where id = p_org;

  perform public.write_audit(
    'studio.status_changed',
    p_org,
    jsonb_strip_nulls(jsonb_build_object('from', previous, 'to', p_status, 'reason', reason))
  );
end;
$$;

create or replace function public.admin_extend_trial(p_org uuid, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
  new_end timestamptz;
begin
  perform public.assert_admin();

  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'Extend by 1 to 90 days' using errcode = '22023';
  end if;

  select * into org from public.organizations where id = p_org for update;
  if not found then
    raise exception 'Studio not found' using errcode = 'P0002';
  end if;
  if org.status <> 'trialing' then
    raise exception 'Only studios on a trial can have it extended' using errcode = '22023';
  end if;

  -- An expired trial restarts from today, not from the old end date.
  new_end := greatest(org.trial_ends_at, now()) + make_interval(days => p_days);
  update public.organizations set trial_ends_at = new_end where id = p_org;

  perform public.write_audit(
    'studio.trial_extended',
    p_org,
    jsonb_build_object('days', p_days, 'from', org.trial_ends_at, 'to', new_end)
  );
  return new_end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin reads
-- ---------------------------------------------------------------------------

-- Bytes stored per studio in the event-photos bucket.
create or replace function public.studio_storage_bytes()
returns table (organization_id uuid, bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select public.storage_path_org(o.name), coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'event-photos'
  group by 1;
$$;

-- Internal: only the admin functions (running as their owner) call this.
revoke all on function public.studio_storage_bytes() from public, anon, authenticated;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'studios', (
      select jsonb_build_object(
        'total', count(*),
        'trialing', count(*) filter (where status = 'trialing'),
        'active', count(*) filter (where status = 'active'),
        'past_due', count(*) filter (where status = 'past_due'),
        'suspended', count(*) filter (where status = 'suspended'),
        'trials_ending_7d', count(*) filter (where status = 'trialing' and trial_ends_at between now() and now() + interval '7 days'),
        'new_30d', count(*) filter (where created_at > now() - interval '30 days')
      )
      from public.organizations
    ),
    'events', (
      select jsonb_build_object(
        'total', count(*),
        'draft', count(*) filter (where status = 'draft'),
        'live', count(*) filter (where status = 'live'),
        'closed', count(*) filter (where status = 'closed'),
        'archived', count(*) filter (where status = 'archived')
      )
      from public.events
    ),
    'guests', (select count(*) from public.guests),
    'photos', (select count(*) from public.photos where deleted_at is null),
    'storage_bytes', (select coalesce(sum(bytes), 0) from public.studio_storage_bytes()),
    'signups_by_week', (
      select coalesce(jsonb_agg(jsonb_build_object('week', w.week, 'studios', w.n) order by w.week), '[]'::jsonb)
      from (
        select gs.week::date as week, count(o.id) as n
        from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as gs (week)
        left join public.organizations o on date_trunc('week', o.created_at) = gs.week
        group by gs.week
      ) w
    )
  );
end;
$$;

create or replace function public.admin_studios(
  p_query text default null,
  p_status public.studio_status default null,
  p_org uuid default null
)
returns table (
  id uuid,
  name text,
  slug text,
  status public.studio_status,
  trial_ends_at timestamptz,
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz,
  owner_email text,
  member_count bigint,
  event_count bigint,
  live_event_count bigint,
  guest_count bigint,
  photo_count bigint,
  storage_bytes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(lower(trim(coalesce(p_query, ''))), '');
begin
  perform public.assert_admin();
  return query
  select
    o.id, o.name, o.slug, o.status, o.trial_ends_at, o.suspended_at, o.suspended_reason, o.created_at,
    owner.email::text,
    (select count(*) from public.organization_members m where m.organization_id = o.id),
    (select count(*) from public.events e where e.organization_id = o.id),
    (select count(*) from public.events e where e.organization_id = o.id and e.status = 'live'),
    (select count(*) from public.guests g join public.events e on e.id = g.event_id where e.organization_id = o.id),
    (select count(*) from public.photos p join public.events e on e.id = p.event_id where e.organization_id = o.id and p.deleted_at is null),
    coalesce((select s.bytes from public.studio_storage_bytes() s where s.organization_id = o.id), 0)::bigint
  from public.organizations o
  left join lateral (
    select u.email
    from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = o.id and m.role = 'owner'
    order by m.created_at
    limit 1
  ) owner on true
  where (p_org is null or o.id = p_org)
    and (p_status is null or o.status = p_status)
    and (
      q is null
      or lower(o.name) like '%' || q || '%'
      or o.slug like '%' || q || '%'
      or lower(coalesce(owner.email::text, '')) like '%' || q || '%'
    )
  order by o.created_at desc
  limit 500;
end;
$$;

create or replace function public.admin_studio_members(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
  select m.user_id, u.email::text, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
  order by m.role, m.created_at;
end;
$$;

create or replace function public.admin_events(
  p_status public.event_status default null,
  p_query text default null,
  p_org uuid default null
)
returns table (
  id uuid,
  couple_names text,
  slug text,
  status public.event_status,
  starts_at timestamptz,
  venue text,
  organization_id uuid,
  studio_name text,
  guest_count bigint,
  photo_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := nullif(lower(trim(coalesce(p_query, ''))), '');
begin
  perform public.assert_admin();
  return query
  select
    e.id, e.couple_names, e.slug, e.status, e.starts_at, e.venue, e.organization_id, o.name,
    (select count(*) from public.guests g where g.event_id = e.id),
    (select count(*) from public.photos p where p.event_id = e.id and p.deleted_at is null),
    e.created_at
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where (p_status is null or e.status = p_status)
    and (p_org is null or e.organization_id = p_org)
    and (q is null or lower(e.couple_names) like '%' || q || '%' or lower(o.name) like '%' || q || '%')
  order by e.starts_at desc
  limit 500;
end;
$$;

create or replace function public.admin_audit_entries(p_org uuid default null, p_limit integer default 100)
returns table (
  id bigint,
  created_at timestamptz,
  action text,
  actor_email text,
  organization_id uuid,
  studio_name text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
  select a.id, a.created_at, a.action, coalesce(u.email::text, a.actor_email), a.organization_id, coalesce(o.name, a.studio_name), a.details
  from public.admin_audit_log a
  left join auth.users u on u.id = a.actor_id
  left join public.organizations o on o.id = a.organization_id
  where p_org is null or a.organization_id = p_org
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke all on function public.admin_set_studio_status(uuid, public.studio_status, text) from public, anon;
revoke all on function public.admin_extend_trial(uuid, integer) from public, anon;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_studios(text, public.studio_status, uuid) from public, anon;
revoke all on function public.admin_studio_members(uuid) from public, anon;
revoke all on function public.admin_events(public.event_status, text, uuid) from public, anon;
revoke all on function public.admin_audit_entries(uuid, integer) from public, anon;

grant execute on function public.admin_set_studio_status(uuid, public.studio_status, text) to authenticated;
grant execute on function public.admin_extend_trial(uuid, integer) to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_studios(text, public.studio_status, uuid) to authenticated;
grant execute on function public.admin_studio_members(uuid) to authenticated;
grant execute on function public.admin_events(public.event_status, text, uuid) to authenticated;
grant execute on function public.admin_audit_entries(uuid, integer) to authenticated;
