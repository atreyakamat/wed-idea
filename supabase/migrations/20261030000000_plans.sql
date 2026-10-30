-- Plans, limits and payments.
--
-- * Plans are data (public.plans), edited by platform admins through an
--   audited function. Each sets a monthly price and limits.
-- * Every studio is on a plan. New studios are on the trial plan.
-- * Limits are enforced here, not just in the app: events per month (by the
--   event's date, in India time), photos per event, team seats and gallery
--   length. Errors carry hint 'plan_limit' and a message fit to show.
-- * Access: a studio whose trial has ended, or whose payment is more than
--   7 days late, can't create events or go live. An event that is already
--   live keeps capturing until 12 hours after it ends, so a wedding is never
--   cut off halfway. Suspension (previous migration) still stops everything.
--   Errors carry hint 'studio_access'.
-- * Payments are recorded by admins for now (UPI, bank, cash). Razorpay can
--   insert the same rows later; (method, reference) is unique so a webhook
--   can't record one payment twice.
-- * Studios ask to upgrade with request_plan(); admins see open requests.

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------

create table public.plans (
  id                text primary key check (id ~ '^[a-z][a-z0-9-]{1,30}$'),
  name              text not null check (char_length(name) between 1 and 40),
  price_paise       integer not null check (price_paise >= 0),
  events_per_month  integer not null check (events_per_month between 1 and 1000),
  photos_per_event  integer not null check (photos_per_event between 1 and 100000),
  team_seats        integer not null check (team_seats between 1 and 500),
  gallery_days      integer not null check (gallery_days between 1 and 365),
  remove_branding   boolean not null default false,
  is_trial          boolean not null default false,
  sort              integer not null default 0,
  updated_at        timestamptz not null default now()
);

-- Exactly one trial plan.
create unique index plans_one_trial on public.plans (is_trial) where is_trial;

insert into public.plans (id, name, price_paise, events_per_month, photos_per_event, team_seats, gallery_days, remove_branding, is_trial, sort) values
  ('trial',   'Trial',   0,      1,  300,  2,  7,  false, true,  0),
  ('starter', 'Starter', 149900, 4,  1500, 3,  7,  false, false, 1),
  ('pro',     'Pro',     399900, 15, 5000, 10, 30, true,  false, 2);

alter table public.plans enable row level security;

-- Plans are public information (the pricing table).
create policy "anyone reads plans"
  on public.plans for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Studio plan and paid-until date
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column plan_id    text not null default 'trial' references public.plans (id),
  add column paid_until timestamptz;

create index organizations_plan_id_idx on public.organizations (plan_id);

-- Plan and paid-until change only through the admin functions too.
create or replace function public.guard_studio_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.status, new.trial_ends_at, new.suspended_at, new.suspended_reason, new.plan_id, new.paid_until)
         is distinct from (old.status, old.trial_ends_at, old.suspended_at, old.suspended_reason, old.plan_id, old.paid_until) then
    raise exception 'Only platform admins can change a studio''s status, plan or trial'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

-- How long a payment can be late before new work is blocked.
create or replace function public.payment_grace()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '7 days' $$;

-- What a studio may do right now:
--   ok               everything
--   payment_due      everything, but payment is late (grace period)
--   trial_ended      no new events, no going live
--   payment_overdue  no new events, no going live
--   suspended        nothing new at all
-- Active studios with no paid-until date are complimentary.
create or replace function public.access_for(
  p_status public.studio_status,
  p_trial_ends_at timestamptz,
  p_paid_until timestamptz,
  p_now timestamptz default now()
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'suspended' then 'suspended'
    when p_status = 'trialing' then case when p_trial_ends_at <= p_now then 'trial_ended' else 'ok' end
    when p_status = 'past_due' and p_paid_until is null then 'payment_overdue'
    when p_paid_until is null then 'ok'
    when p_paid_until + public.payment_grace() <= p_now then 'payment_overdue'
    when p_paid_until <= p_now or p_status = 'past_due' then 'payment_due'
    else 'ok'
  end;
$$;

-- A studio's access, for its own members and platform admins only.
create or replace function public.studio_access(org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.access_for(o.status, o.trial_ends_at, o.paid_until)
  from public.organizations o
  where o.id = org and public.is_org_member(org);
$$;

revoke all on function public.studio_access(uuid) from public, anon;
grant execute on function public.studio_access(uuid) to authenticated;

-- Replaces the suspension-only rule from the previous migration.
create or replace function public.block_suspended_studio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org uuid;
  ends timestamptz;
  access text;
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
    -- Editing an event is fine; creating one or going live needs access.
    if tg_op = 'UPDATE' and not (new.status = 'live' and old.status is distinct from 'live') then
      return new;
    end if;
    org := new.organization_id;
  else
    select e.organization_id, e.ends_at into org, ends from public.events e where e.id = new.event_id;
  end if;

  access := public.studio_access(org);

  if access = 'suspended' then
    raise exception 'This studio is suspended. Contact support to reactivate it.'
      using errcode = '42501', hint = 'studio_access';
  end if;

  if access in ('trial_ended', 'payment_overdue') then
    -- Guests and photos: an event that's already running may finish.
    if tg_table_name <> 'events' and (tg_op = 'UPDATE' or now() <= ends + interval '12 hours') then
      return new;
    end if;
    if access = 'trial_ended' then
      raise exception 'Your trial has ended. Choose a plan to start new events.'
        using errcode = '42501', hint = 'studio_access';
    end if;
    raise exception 'Your payment is overdue. Settle it to start new events.'
      using errcode = '42501', hint = 'studio_access';
  end if;

  return new;
end;
$$;

-- Storage uploads follow the same rule as photo rows.
create or replace function public.studio_can_upload(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.studio_access(org), 'suspended') <> 'suspended';
$$;

revoke all on function public.studio_can_upload(uuid) from public, anon;
grant execute on function public.studio_can_upload(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------

-- The next plan up that allows more of something, for the error message.
create or replace function public.upgrade_hint(p_column text, p_current integer)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  next_plan record;
begin
  execute format(
    'select name, %1$I as amount from public.plans where not is_trial and %1$I > $1 order by sort limit 1',
    p_column
  ) into next_plan using p_current;
  if next_plan is null then
    return '';
  end if;
  return format(' Upgrade to %s for %s.', next_plan.name, to_char(next_plan.amount, 'FM999,999,999'));
end;
$$;

revoke all on function public.upgrade_hint(text, integer) from public, anon, authenticated;

create or replace function public.raise_plan_limit(p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', p_message using errcode = 'P0001', hint = 'plan_limit';
end;
$$;

create or replace function public.enforce_event_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans;
  month_start timestamp;
  used integer;
begin
  -- Only requests from studio users are limited; admins and server code are not.
  if (select auth.role()) is distinct from 'authenticated' or public.is_admin() then
    return new;
  end if;

  select p.* into plan
  from public.organizations o join public.plans p on p.id = o.plan_id
  where o.id = new.organization_id
  for update of o;  -- one limit check per studio at a time

  -- Events per month, by the event's own date in India time.
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at then
    month_start := date_trunc('month', new.starts_at at time zone 'Asia/Kolkata');
    select count(*) into used
    from public.events e
    where e.organization_id = new.organization_id
      and e.id <> new.id
      and date_trunc('month', e.starts_at at time zone 'Asia/Kolkata') = month_start;
    if used >= plan.events_per_month then
      perform public.raise_plan_limit(format(
        'You''ve used %s of %s events for %s on the %s plan.%s',
        used, plan.events_per_month, to_char(month_start, 'FMMonth YYYY'), plan.name,
        public.upgrade_hint('events_per_month', plan.events_per_month)
      ));
    end if;
  end if;

  -- Gallery length.
  if new.gallery_expires_at > new.ends_at + make_interval(days => plan.gallery_days) + interval '1 hour' then
    perform public.raise_plan_limit(format(
      'The %s plan keeps galleries for up to %s days.%s',
      plan.name, plan.gallery_days, public.upgrade_hint('gallery_days', plan.gallery_days)
    ));
  end if;

  return new;
end;
$$;

create trigger events_enforce_limits
  before insert or update of starts_at, gallery_expires_at, ends_at on public.events
  for each row execute function public.enforce_event_limits();

create or replace function public.enforce_photo_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans;
  used integer;
begin
  if (select auth.role()) is distinct from 'authenticated' or public.is_admin() then
    return new;
  end if;

  select p.* into plan
  from public.events e
  join public.organizations o on o.id = e.organization_id
  join public.plans p on p.id = o.plan_id
  where e.id = new.event_id;

  -- One count per event at a time, so parallel uploads can't overshoot.
  perform pg_advisory_xact_lock(hashtext('photos:' || new.event_id::text));
  select count(*) into used from public.photos where event_id = new.event_id and deleted_at is null;
  if used >= plan.photos_per_event then
    perform public.raise_plan_limit(format(
      'This event has reached %s photos, the most the %s plan allows.%s',
      to_char(plan.photos_per_event, 'FM999,999,999'), plan.name,
      public.upgrade_hint('photos_per_event', plan.photos_per_event)
    ));
  end if;
  return new;
end;
$$;

create trigger photos_enforce_limit
  before insert on public.photos
  for each row execute function public.enforce_photo_limit();

create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans;
  used integer;
begin
  if (select auth.role()) is distinct from 'authenticated' or public.is_admin() then
    return new;
  end if;

  select p.* into plan
  from public.organizations o join public.plans p on p.id = o.plan_id
  where o.id = new.organization_id
  for update of o;
  select count(*) into used from public.organization_members where organization_id = new.organization_id;
  if used >= plan.team_seats then
    perform public.raise_plan_limit(format(
      'The %s plan has %s team seats, and they''re all taken.%s',
      plan.name, plan.team_seats, public.upgrade_hint('team_seats', plan.team_seats)
    ));
  end if;
  return new;
end;
$$;

create trigger organization_members_enforce_seats
  before insert on public.organization_members
  for each row execute function public.enforce_seat_limit();

revoke all on function public.enforce_event_limits() from public, anon, authenticated;
revoke all on function public.enforce_photo_limit() from public, anon, authenticated;
revoke all on function public.enforce_seat_limit() from public, anon, authenticated;
revoke all on function public.raise_plan_limit(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create type public.payment_method as enum ('upi', 'bank_transfer', 'cash', 'razorpay', 'other');

-- Financial records outlive studios: deleting a studio with payments is
-- refused until account deletion handles it explicitly.
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  plan_id          text not null references public.plans (id),
  amount_paise     integer not null check (amount_paise > 0),
  method           public.payment_method not null,
  reference        text check (char_length(reference) between 1 and 120),
  months           integer not null check (months between 1 and 24),
  period_start     timestamptz not null,
  period_end       timestamptz not null check (period_end > period_start),
  recorded_by      uuid,
  created_at       timestamptz not null default now()
);

create index payments_organization_idx on public.payments (organization_id, created_at desc);
create unique index payments_method_reference_key on public.payments (method, reference) where reference is not null;

alter table public.payments enable row level security;

create policy "managers read their payments"
  on public.payments for select
  to authenticated
  using ((select public.is_org_manager(organization_id)));

-- ---------------------------------------------------------------------------
-- Upgrade requests
-- ---------------------------------------------------------------------------

create table public.plan_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  plan_id          text not null references public.plans (id),
  note             text check (char_length(note) <= 500),
  requested_by     uuid,
  status           text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid
);

create unique index plan_requests_one_open on public.plan_requests (organization_id) where status = 'open';

alter table public.plan_requests enable row level security;

create policy "managers read their requests"
  on public.plan_requests for select
  to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Owners and admins of a studio ask for a plan. One open request per studio;
-- asking again replaces it.
create or replace function public.request_plan(p_org uuid, p_plan text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_org and user_id = (select auth.uid()) and role in ('owner', 'admin')
  ) then
    raise exception 'Only studio owners and admins can change the plan' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans where id = p_plan and not is_trial) then
    raise exception 'Choose a paid plan' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters' using errcode = '22023';
  end if;

  update public.plan_requests
  set plan_id = p_plan, note = v_note, requested_by = (select auth.uid()), created_at = now()
  where organization_id = p_org and status = 'open'
  returning id into request_id;

  if request_id is null then
    insert into public.plan_requests (organization_id, plan_id, note, requested_by)
    values (p_org, p_plan, v_note, (select auth.uid()))
    returning id into request_id;
  end if;
  return request_id;
end;
$$;

revoke all on function public.request_plan(uuid, text, text) from public, anon;
grant execute on function public.request_plan(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin actions
-- ---------------------------------------------------------------------------

-- Status changes now respect plans: "active" needs a paid plan, and going
-- back to "trialing" puts the studio on the trial plan.
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
  org public.organizations;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();

  if p_status = 'suspended' and reason is null then
    raise exception 'Give a reason for suspending the studio' using errcode = '22023';
  end if;
  if char_length(reason) > 500 then
    raise exception 'Keep the reason under 500 characters' using errcode = '22023';
  end if;

  select * into org from public.organizations where id = p_org for update;
  if not found then
    raise exception 'Studio not found' using errcode = 'P0002';
  end if;
  if org.status = p_status then
    return;
  end if;
  if p_status in ('active', 'past_due') and org.plan_id = 'trial' then
    raise exception 'Record a payment or choose a paid plan first' using errcode = '22023';
  end if;

  update public.organizations
  set status = p_status,
      plan_id = case when p_status = 'trialing' then 'trial' else plan_id end,
      suspended_at = case when p_status = 'suspended' then now() end,
      suspended_reason = case when p_status = 'suspended' then reason end
  where id = p_org;

  perform public.write_audit(
    'studio.status_changed',
    p_org,
    jsonb_strip_nulls(jsonb_build_object('from', org.status, 'to', p_status, 'reason', reason))
  );
end;
$$;

-- Moves a studio to a plan without a payment (a complimentary upgrade, or a
-- downgrade). Paid plans make a trialing studio active.
create or replace function public.admin_set_plan(p_org uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
  plan public.plans;
begin
  perform public.assert_admin();
  select * into plan from public.plans where id = p_plan;
  if not found then
    raise exception 'Plan not found' using errcode = '22023';
  end if;
  select * into org from public.organizations where id = p_org for update;
  if not found then
    raise exception 'Studio not found' using errcode = 'P0002';
  end if;
  if org.plan_id = p_plan then
    return;
  end if;

  update public.organizations
  set plan_id = p_plan,
      status = case
        when status = 'suspended' then status
        when plan.is_trial then 'trialing'
        when status = 'trialing' then 'active'
        else status
      end
  where id = p_org;

  perform public.write_audit('studio.plan_changed', p_org, jsonb_build_object('from', org.plan_id, 'to', p_plan));
end;
$$;

-- Records a payment: the studio moves to the plan, becomes active (unless
-- suspended) and is paid up to the end of the period. A period starts when
-- the previous one ends, or today if that's already passed.
create or replace function public.admin_record_payment(
  p_org uuid,
  p_plan text,
  p_amount_paise integer,
  p_method public.payment_method,
  p_reference text,
  p_months integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  org public.organizations;
  plan public.plans;
  starts timestamptz;
  ends timestamptz;
  ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  perform public.assert_admin();
  select * into plan from public.plans where id = p_plan and not is_trial;
  if not found then
    raise exception 'Choose a paid plan' using errcode = '22023';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Enter the amount received' using errcode = '22023';
  end if;
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'Cover 1 to 24 months' using errcode = '22023';
  end if;
  if char_length(ref) > 120 then
    raise exception 'Keep the reference under 120 characters' using errcode = '22023';
  end if;
  if ref is not null and exists (select 1 from public.payments where method = p_method and reference = ref) then
    raise exception 'A payment with that reference is already recorded' using errcode = '22023';
  end if;

  select * into org from public.organizations where id = p_org for update;
  if not found then
    raise exception 'Studio not found' using errcode = 'P0002';
  end if;

  starts := greatest(coalesce(org.paid_until, now()), now());
  ends := starts + make_interval(months => p_months);

  insert into public.payments (organization_id, plan_id, amount_paise, method, reference, months, period_start, period_end, recorded_by)
  values (p_org, p_plan, p_amount_paise, p_method, ref, p_months, starts, ends, (select auth.uid()));

  update public.organizations
  set plan_id = p_plan,
      paid_until = ends,
      status = case when status = 'suspended' then status else 'active' end
  where id = p_org;

  update public.plan_requests
  set status = 'done', resolved_at = now(), resolved_by = (select auth.uid())
  where organization_id = p_org and status = 'open';

  perform public.write_audit(
    'studio.payment_recorded',
    p_org,
    jsonb_strip_nulls(jsonb_build_object(
      'plan', p_plan, 'amount_paise', p_amount_paise, 'method', p_method,
      'reference', ref, 'months', p_months, 'until', ends
    ))
  );
  return ends;
end;
$$;

create or replace function public.admin_dismiss_plan_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  perform public.assert_admin();
  update public.plan_requests
  set status = 'dismissed', resolved_at = now(), resolved_by = (select auth.uid())
  where id = p_request and status = 'open'
  returning organization_id into org;
  if org is null then
    raise exception 'That request is already handled' using errcode = '22023';
  end if;
  perform public.write_audit('plan_request.dismissed', org, jsonb_build_object('request', p_request));
end;
$$;

-- Edits a plan's name, price and limits. Existing studios over a lowered
-- limit keep what they have; only new events, photos and seats are checked.
create or replace function public.admin_update_plan(
  p_id text,
  p_name text,
  p_price_paise integer,
  p_events_per_month integer,
  p_photos_per_event integer,
  p_team_seats integer,
  p_gallery_days integer,
  p_remove_branding boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.plans;
  v_after public.plans;
begin
  perform public.assert_admin();
  select * into v_before from public.plans where id = p_id for update;
  if not found then
    raise exception 'Plan not found' using errcode = '22023';
  end if;
  if v_before.is_trial and p_price_paise <> 0 then
    raise exception 'The trial is free' using errcode = '22023';
  end if;

  update public.plans
  set name = trim(p_name),
      price_paise = p_price_paise,
      events_per_month = p_events_per_month,
      photos_per_event = p_photos_per_event,
      team_seats = p_team_seats,
      gallery_days = p_gallery_days,
      remove_branding = p_remove_branding,
      updated_at = now()
  where id = p_id
  returning * into v_after;

  perform public.write_audit(
    'plan.updated',
    null,
    jsonb_build_object(
      'plan', p_id,
      'before', to_jsonb(v_before) - 'updated_at' - 'sort' - 'is_trial' - 'id',
      'after', to_jsonb(v_after) - 'updated_at' - 'sort' - 'is_trial' - 'id'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin reads (replacing earlier versions to add plan and access)
-- ---------------------------------------------------------------------------

drop function public.admin_studios(text, public.studio_status, uuid);

create function public.admin_studios(
  p_query text default null,
  p_status public.studio_status default null,
  p_org uuid default null
)
returns table (
  id uuid,
  name text,
  slug text,
  status public.studio_status,
  access text,
  plan_id text,
  plan_name text,
  paid_until timestamptz,
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
    o.id, o.name, o.slug, o.status,
    public.access_for(o.status, o.trial_ends_at, o.paid_until),
    o.plan_id, p.name, o.paid_until,
    o.trial_ends_at, o.suspended_at, o.suspended_reason, o.created_at,
    owner.email::text,
    (select count(*) from public.organization_members m where m.organization_id = o.id),
    (select count(*) from public.events e where e.organization_id = o.id),
    (select count(*) from public.events e where e.organization_id = o.id and e.status = 'live'),
    (select count(*) from public.guests g join public.events e on e.id = g.event_id where e.organization_id = o.id),
    (select count(*) from public.photos ph join public.events e on e.id = ph.event_id where e.organization_id = o.id and ph.deleted_at is null),
    coalesce((select s.bytes from public.studio_storage_bytes() s where s.organization_id = o.id), 0)::bigint
  from public.organizations o
  join public.plans p on p.id = o.plan_id
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

revoke all on function public.admin_studios(text, public.studio_status, uuid) from public, anon;
grant execute on function public.admin_studios(text, public.studio_status, uuid) to authenticated;

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
        'past_due', count(*) filter (where public.access_for(status, trial_ends_at, paid_until) in ('payment_due', 'payment_overdue')),
        'suspended', count(*) filter (where status = 'suspended'),
        'trials_ending_7d', count(*) filter (where status = 'trialing' and trial_ends_at between now() and now() + interval '7 days'),
        'trials_ended', count(*) filter (where public.access_for(status, trial_ends_at, paid_until) = 'trial_ended'),
        'new_30d', count(*) filter (where created_at > now() - interval '30 days')
      )
      from public.organizations
    ),
    'revenue', (
      select jsonb_build_object(
        'mrr_paise', coalesce(sum(p.price_paise) filter (where o.status = 'active' and o.paid_until is not null), 0),
        'received_30d_paise', (select coalesce(sum(amount_paise), 0) from public.payments where created_at > now() - interval '30 days')
      )
      from public.organizations o join public.plans p on p.id = o.plan_id
    ),
    'open_requests', (select count(*) from public.plan_requests where status = 'open'),
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

create or replace function public.admin_payments(p_org uuid default null, p_limit integer default 100)
returns table (
  id uuid,
  created_at timestamptz,
  organization_id uuid,
  studio_name text,
  plan_name text,
  amount_paise integer,
  method public.payment_method,
  reference text,
  months integer,
  period_start timestamptz,
  period_end timestamptz,
  recorded_by_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
  select pay.id, pay.created_at, pay.organization_id, o.name, p.name, pay.amount_paise, pay.method, pay.reference,
         pay.months, pay.period_start, pay.period_end, u.email::text
  from public.payments pay
  join public.organizations o on o.id = pay.organization_id
  join public.plans p on p.id = pay.plan_id
  left join auth.users u on u.id = pay.recorded_by
  where p_org is null or pay.organization_id = p_org
  order by pay.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.admin_plan_requests()
returns table (
  id uuid,
  created_at timestamptz,
  organization_id uuid,
  studio_name text,
  current_plan text,
  plan_id text,
  plan_name text,
  note text,
  requested_by_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
  select r.id, r.created_at, r.organization_id, o.name, cp.name, r.plan_id, p.name, r.note, u.email::text
  from public.plan_requests r
  join public.organizations o on o.id = r.organization_id
  join public.plans cp on cp.id = o.plan_id
  join public.plans p on p.id = r.plan_id
  left join auth.users u on u.id = r.requested_by
  where r.status = 'open'
  order by r.created_at;
end;
$$;

revoke all on function public.admin_set_plan(uuid, text) from public, anon;
revoke all on function public.admin_record_payment(uuid, text, integer, public.payment_method, text, integer) from public, anon;
revoke all on function public.admin_dismiss_plan_request(uuid) from public, anon;
revoke all on function public.admin_update_plan(text, text, integer, integer, integer, integer, integer, boolean) from public, anon;
revoke all on function public.admin_payments(uuid, integer) from public, anon;
revoke all on function public.admin_plan_requests() from public, anon;

grant execute on function public.admin_set_plan(uuid, text) to authenticated;
grant execute on function public.admin_record_payment(uuid, text, integer, public.payment_method, text, integer) to authenticated;
grant execute on function public.admin_dismiss_plan_request(uuid) to authenticated;
grant execute on function public.admin_update_plan(text, text, integer, integer, integer, integer, integer, boolean) to authenticated;
grant execute on function public.admin_payments(uuid, integer) to authenticated;
grant execute on function public.admin_plan_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: uploads follow access, not just suspension
-- ---------------------------------------------------------------------------

drop policy "active members upload photos" on storage.objects;
drop policy "active members replace photos" on storage.objects;

create policy "active members upload photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and (select public.studio_can_upload(public.storage_path_org(name)))
  );

create policy "active members replace photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))))
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and (select public.studio_can_upload(public.storage_path_org(name)))
  );
