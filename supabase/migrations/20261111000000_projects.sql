-- Projects: fast photo delivery for any shoot (wedding, birthday, concert,
-- outdoor). A studio uploads a folder of photos (from the browser, or from
-- the PC worker watching a folder), hides any it doesn't want to share, and
-- publishes a private gallery link it can send to everyone.
--
-- * Photos are stored as a web-size image (2400 px long edge) and a
--   thumbnail. Originals stay on the photographer's PC or Drive.
-- * Paths are "<studio>/<project>/<photo>.jpg" and ".thumb.jpg".
-- * Plan limits apply, counted separately from events: projects per month
--   use the plan's events-per-month number, photos per project use its
--   photos-per-event number, and a published gallery stays open for the
--   plan's gallery days. The limits apply to every writer, including the
--   server-side worker API; only platform admins skip them.
-- * A project that has ever been published can't be deleted (it counts
--   toward the month either way); it can be archived. Its gallery stays open
--   for the plan's gallery days from the first time it was published, so
--   unpublishing and publishing again never stretches it.
-- * The PC worker authenticates with a worker token. The app makes the token,
--   shows it once and stores only its SHA-256 hash; it never reaches the
--   database.

create type public.project_status as enum ('draft', 'published', 'archived');
create type public.project_kind as enum ('wedding', 'birthday', 'concert', 'outdoor', 'portrait', 'corporate', 'other');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  name                text not null check (char_length(trim(name)) between 1 and 120),
  slug                text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  kind                public.project_kind not null default 'other',
  shoot_date          date,
  status              public.project_status not null default 'draft',
  access_token        text not null unique default encode(gen_random_bytes(24), 'hex'),
  published_at        timestamptz,
  first_published_at  timestamptz,
  gallery_expires_at  timestamptz,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, slug),
  constraint projects_published_has_dates check (
    status <> 'published' or (published_at is not null and gallery_expires_at is not null)
  )
);

create index projects_organization_idx on public.projects (organization_id, created_at desc);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_photos (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  file_name        text not null check (char_length(file_name) between 1 and 255),
  path             text not null unique,
  thumb_path       text not null unique,
  width            integer not null check (width between 1 and 20000),
  height           integer not null check (height between 1 and 20000),
  bytes            bigint check (bytes >= 0),
  taken_at         timestamptz,
  source           text not null check (source in ('browser', 'worker')),
  hidden           boolean not null default false,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  -- Re-uploading the same folder never makes duplicates.
  unique (project_id, file_name)
);

create index project_photos_order_idx on public.project_photos (project_id, taken_at, file_name);

create table public.worker_tokens (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  name             text not null check (char_length(trim(name)) between 1 and 60),
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint       text not null check (char_length(token_hint) = 4),
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  last_used_at     timestamptz,
  revoked_at       timestamptz
);

create index worker_tokens_organization_idx on public.worker_tokens (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A studio's plan row and whether it may start new work right now.
create or replace function public.studio_plan_access(org uuid)
returns table (plan public.plans, access text)
language sql
stable
security definer
set search_path = ''
as $$
  select p, public.access_for(o.status, o.trial_ends_at, o.paid_until)
  from public.organizations o
  join public.plans p on p.id = o.plan_id
  where o.id = org;
$$;

revoke all on function public.studio_plan_access(uuid) from public, anon, authenticated;

create or replace function public.raise_project_access(access text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if access = 'suspended' then
    raise exception 'This studio is suspended. Contact support to reactivate it.' using errcode = '42501', hint = 'studio_access';
  elsif access = 'trial_ended' then
    raise exception 'Your trial has ended. Choose a plan to start new projects.' using errcode = '42501', hint = 'studio_access';
  elsif access = 'payment_overdue' then
    raise exception 'Your payment is overdue. Settle it to start new projects.' using errcode = '42501', hint = 'studio_access';
  end if;
end;
$$;

revoke all on function public.raise_project_access(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Project rules
-- ---------------------------------------------------------------------------

create or replace function public.enforce_project_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  month_start timestamp;
  used integer;
  visible integer;
  -- These run as the function's owner, so the caller is read from the JWT.
  by_studio boolean := (select auth.role()) in ('authenticated', 'anon') and not public.is_admin();
begin
  if tg_op = 'INSERT' then
    if public.is_admin() then
      return new;
    end if;
    select * into rec from public.studio_plan_access(new.organization_id);
    perform public.raise_project_access(rec.access);

    -- New projects start as drafts; publishing goes through an update.
    new.status := 'draft';
    new.published_at := null;
    new.first_published_at := null;
    new.gallery_expires_at := null;

    month_start := date_trunc('month', now() at time zone 'Asia/Kolkata');
    perform pg_advisory_xact_lock(hashtext('projects:' || new.organization_id::text));
    select count(*) into used
    from public.projects
    where organization_id = new.organization_id
      and date_trunc('month', created_at at time zone 'Asia/Kolkata') = month_start;
    if used >= (rec.plan).events_per_month then
      perform public.raise_plan_limit(format(
        'You''ve started %s of %s projects for %s on the %s plan.%s',
        used, (rec.plan).events_per_month, to_char(month_start, 'FMMonth YYYY'), (rec.plan).name,
        public.upgrade_hint('events_per_month', (rec.plan).events_per_month, 'projects a month')
      ));
    end if;
    return new;
  end if;

  -- UPDATE. The studio, link token and publish dates are never set directly.
  if by_studio then
    new.organization_id := old.organization_id;
    new.access_token := old.access_token;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.published_at := old.published_at;
    new.first_published_at := old.first_published_at;
    new.gallery_expires_at := old.gallery_expires_at;
  end if;

  if new.status = 'published' and old.status is distinct from 'published' then
    if not public.is_admin() then
      select * into rec from public.studio_plan_access(new.organization_id);
      perform public.raise_project_access(rec.access);
      select count(*) into visible from public.project_photos where project_id = new.id and not hidden;
      if visible = 0 then
        raise exception 'Add at least one photo before publishing.' using errcode = '22023', hint = 'project_rule';
      end if;
      new.published_at := now();
      new.first_published_at := coalesce(old.first_published_at, now());
      new.gallery_expires_at := new.first_published_at + make_interval(days => (rec.plan).gallery_days);
      if new.gallery_expires_at <= now() then
        raise exception 'This gallery''s sharing period has ended, so it can''t be published again.'
          using errcode = '22023', hint = 'project_rule';
      end if;
    else
      new.published_at := coalesce(new.published_at, now());
      new.first_published_at := coalesce(old.first_published_at, new.published_at);
      new.gallery_expires_at := coalesce(new.gallery_expires_at, now() + interval '30 days');
    end if;
  elsif new.status <> 'published' and old.status = 'published' then
    -- Unpublished or archived: the link stops working.
    new.published_at := null;
    new.gallery_expires_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_project_rules() from public, anon, authenticated;

create trigger projects_enforce_rules
  before insert or update on public.projects
  for each row execute function public.enforce_project_rules();

create or replace function public.keep_published_projects()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.first_published_at is not null and current_user in ('authenticated', 'anon') and not public.is_admin() then
    raise exception 'A project that has been shared can''t be deleted. Archive it instead.'
      using errcode = '42501', hint = 'project_rule';
  end if;
  return old;
end;
$$;

revoke all on function public.keep_published_projects() from public, anon, authenticated;

create trigger projects_keep_published
  before delete on public.projects
  for each row execute function public.keep_published_projects();

-- ---------------------------------------------------------------------------
-- Photo rules
-- ---------------------------------------------------------------------------

create or replace function public.enforce_project_photo_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proj public.projects;
  rec record;
  used integer;
  base text;
begin
  if tg_op = 'UPDATE' then
    -- Only "hidden" changes after upload (admins and server code excepted).
    if (select auth.role()) in ('authenticated', 'anon') and not public.is_admin()
       and (to_jsonb(new) - 'hidden') is distinct from (to_jsonb(old) - 'hidden') then
      raise exception 'Only a photo''s visibility can be changed.' using errcode = '42501', hint = 'project_rule';
    end if;
    return new;
  end if;

  select * into proj from public.projects where id = new.project_id;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  -- The studio comes from the project, never from the caller.
  new.organization_id := proj.organization_id;
  base := proj.organization_id::text || '/' || proj.id::text || '/';
  if left(new.path, char_length(base)) <> base or left(new.thumb_path, char_length(base)) <> base then
    raise exception 'Photo paths must be inside the project''s folder' using errcode = '22023';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if proj.status = 'archived' then
    raise exception 'This project is archived. Restore it to add photos.' using errcode = '22023', hint = 'project_rule';
  end if;

  select * into rec from public.studio_plan_access(proj.organization_id);
  perform public.raise_project_access(rec.access);

  -- One count per project at a time, so parallel uploads can't overshoot.
  perform pg_advisory_xact_lock(hashtext('project-photos:' || proj.id::text));
  select count(*) into used from public.project_photos where project_id = proj.id;
  if used >= (rec.plan).photos_per_event then
    perform public.raise_plan_limit(format(
      'This project has reached %s photos, the most the %s plan allows.%s',
      to_char((rec.plan).photos_per_event, 'FM999,999,999'), (rec.plan).name,
      public.upgrade_hint('photos_per_event', (rec.plan).photos_per_event, 'photos per project')
    ));
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_project_photo_rules() from public, anon, authenticated;

create trigger project_photos_enforce_rules
  before insert or update on public.project_photos
  for each row execute function public.enforce_project_photo_rules();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_photos enable row level security;
alter table public.worker_tokens enable row level security;

create policy "members read their projects"
  on public.projects for select to authenticated
  using ((select public.is_org_member(organization_id)));

create policy "managers create projects"
  on public.projects for insert to authenticated
  with check ((select public.is_org_manager(organization_id)));

create policy "managers update projects"
  on public.projects for update to authenticated
  using ((select public.is_org_manager(organization_id)))
  with check ((select public.is_org_manager(organization_id)));

create policy "managers delete projects"
  on public.projects for delete to authenticated
  using ((select public.is_org_manager(organization_id)));

create policy "members read project photos"
  on public.project_photos for select to authenticated
  using ((select public.is_org_member(organization_id)));

-- organization_id is filled in from the project by the trigger, so the check
-- is on the project the photo goes into.
create policy "members add project photos"
  on public.project_photos for insert to authenticated
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and (select public.is_org_member(p.organization_id))
  ));

create policy "members hide project photos"
  on public.project_photos for update to authenticated
  using ((select public.is_org_member(organization_id)))
  with check ((select public.is_org_member(organization_id)));

create policy "managers delete project photos"
  on public.project_photos for delete to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Tokens are created and revoked only through the functions below.
create policy "managers see their worker tokens"
  on public.worker_tokens for select to authenticated
  using ((select public.is_org_manager(organization_id)));

-- ---------------------------------------------------------------------------
-- Worker tokens
-- ---------------------------------------------------------------------------

-- Registers a computer for the PC worker. The app makes the token, shows it
-- once and passes only its SHA-256 hash and last 4 characters.
create or replace function public.create_worker_token(p_org uuid, p_name text, p_hash text, p_hint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text := trim(coalesce(p_name, ''));
  new_id uuid;
begin
  -- is_org_manager() is null, not false, for someone outside the studio.
  if not coalesce(public.is_org_manager(p_org), false) then
    raise exception 'Only studio owners and admins can connect a computer' using errcode = '42501';
  end if;
  if char_length(label) not between 1 and 60 then
    raise exception 'Name the computer in 1 to 60 characters' using errcode = '22023', hint = 'project_rule';
  end if;
  perform pg_advisory_xact_lock(hashtext('worker-tokens:' || p_org::text));
  if (select count(*) from public.worker_tokens where organization_id = p_org and revoked_at is null) >= 10 then
    raise exception 'A studio can connect up to 10 computers. Disconnect one first.' using errcode = '22023', hint = 'project_rule';
  end if;

  insert into public.worker_tokens (organization_id, name, token_hash, token_hint)
  values (p_org, label, p_hash, p_hint)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.revoke_worker_token(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.worker_tokens
  set revoked_at = now()
  where id = p_token and revoked_at is null and public.is_org_manager(organization_id);
  if not found then
    raise exception 'That computer is already disconnected' using errcode = '22023', hint = 'project_rule';
  end if;
end;
$$;

revoke all on function public.create_worker_token(uuid, text, text, text) from public, anon;
revoke all on function public.revoke_worker_token(uuid) from public, anon;
grant execute on function public.create_worker_token(uuid, text, text, text) to authenticated;
grant execute on function public.revoke_worker_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-photos', 'project-photos', false, 15 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- A file may go into "<studio>/<project>/..." only for a project of that
-- studio that isn't archived, while the studio may start work.
create or replace function public.can_upload_project_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_path, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      exists (
        select 1
        from public.projects p
        join public.organizations o on o.id = p.organization_id
        where p.id = split_part(p_path, '/', 2)::uuid
          and p.organization_id = public.storage_path_org(p_path)
          and p.status <> 'archived'
          and public.is_org_member(p.organization_id)
          and public.access_for(o.status, o.trial_ends_at, o.paid_until) in ('ok', 'payment_due')
      )
    else false
  end;
$$;

revoke all on function public.can_upload_project_photo(text) from public, anon;
grant execute on function public.can_upload_project_photo(text) to authenticated;

create policy "members read project files"
  on storage.objects for select to authenticated
  using (bucket_id = 'project-photos' and (select public.is_org_member(public.storage_path_org(name))));

create policy "members upload project files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'project-photos' and (select public.can_upload_project_photo(name)));

create policy "managers delete project files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'project-photos' and (select public.is_org_manager(public.storage_path_org(name))));
