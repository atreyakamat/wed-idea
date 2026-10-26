-- Studios (multi-tenant SaaS).
--
-- Every event now belongs to a studio (organizations). Members of a studio
-- see and manage only that studio's data:
--   owner / admin  manage the studio, events, design and orders
--   operator       runs capture at the event: reads events, adds guests and photos
-- Platform admins (admin_users) keep access to everything for support.
--
-- Studios are created through create_organization(), which also makes the
-- caller the owner in one step, so there is no direct insert policy.

create type public.member_role as enum ('owner', 'admin', 'operator');

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             public.member_role not null default 'operator',
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Events belong to a studio. Nothing is deployed yet, so no rows need a
-- backfill; if rows did exist this fails loudly instead of guessing a studio.
alter table public.events
  add column organization_id uuid not null references public.organizations (id) on delete cascade,
  add column backdrop_brief text check (char_length(backdrop_brief) <= 2000);

create index events_organization_id_idx on public.events (organization_id);

-- ---------------------------------------------------------------------------
-- Membership helpers. security definer so policies can call them without
-- recursing into organization_members' own RLS.
-- ---------------------------------------------------------------------------

create or replace function public.org_role(org uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.organization_members
  where organization_id = org and user_id = (select auth.uid());
$$;

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.org_role(org) is not null;
$$;

create or replace function public.is_org_manager(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.org_role(org) in ('owner', 'admin');
$$;

create or replace function public.is_event_member(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = event and public.is_org_member(e.organization_id)
  );
$$;

create or replace function public.is_event_manager(event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = event and public.is_org_manager(e.organization_id)
  );
$$;

revoke all on function public.org_role(uuid) from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_manager(uuid) from public;
revoke all on function public.is_event_member(uuid) from public;
revoke all on function public.is_event_manager(uuid) from public;
grant execute on function public.org_role(uuid) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_manager(uuid) to authenticated;
grant execute on function public.is_event_member(uuid) to authenticated;
grant execute on function public.is_event_manager(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Create a studio and make the caller its owner, atomically.
-- ---------------------------------------------------------------------------

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

  insert into public.organizations (name, slug)
  values (trim(p_name), p_slug)
  returning id into org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (org_id, uid, 'owner');

  return org_id;
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies: studios and members
-- ---------------------------------------------------------------------------

create policy "members read their studio"
  on public.organizations for select
  to authenticated
  using ((select public.is_org_member(id)));

create policy "managers update their studio"
  on public.organizations for update
  to authenticated
  using ((select public.is_org_manager(id)))
  with check ((select public.is_org_manager(id)));

create policy "members read their studio's members"
  on public.organization_members for select
  to authenticated
  using ((select public.is_org_member(organization_id)));

-- Only owners change membership. Owners can't change or remove their own
-- row, so a studio can't lose its last owner by accident.
create policy "owners add members"
  on public.organization_members for insert
  to authenticated
  with check (
    (select public.is_admin() or public.org_role(organization_id) = 'owner')
  );

create policy "owners change other members"
  on public.organization_members for update
  to authenticated
  using (
    (select public.is_admin() or public.org_role(organization_id) = 'owner')
    and user_id <> (select auth.uid())
  )
  with check (
    (select public.is_admin() or public.org_role(organization_id) = 'owner')
    and user_id <> (select auth.uid())
  );

create policy "owners remove other members"
  on public.organization_members for delete
  to authenticated
  using (
    (select public.is_admin() or public.org_role(organization_id) = 'owner')
    and user_id <> (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Policies: replace admin-only rules with studio membership
-- ---------------------------------------------------------------------------

drop policy "admins manage events" on public.events;
drop policy "admins manage guests" on public.guests;
drop policy "admins manage photos" on public.photos;
drop policy "admins manage orders" on public.orders;
drop policy "admins manage order items" on public.order_items;
drop policy "admins manage event photos" on storage.objects;

create policy "members read events"
  on public.events for select
  to authenticated
  using ((select public.is_org_member(organization_id)));

create policy "managers create events"
  on public.events for insert
  to authenticated
  with check ((select public.is_org_manager(organization_id)));

create policy "managers update events"
  on public.events for update
  to authenticated
  using ((select public.is_org_manager(organization_id)))
  with check ((select public.is_org_manager(organization_id)));

create policy "managers delete events"
  on public.events for delete
  to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Operators capture at the event, so every member can add guests and photos.
create policy "members manage guests"
  on public.guests for all
  to authenticated
  using ((select public.is_event_member(event_id)))
  with check ((select public.is_event_member(event_id)));

create policy "members manage photos"
  on public.photos for all
  to authenticated
  using ((select public.is_event_member(event_id)))
  with check ((select public.is_event_member(event_id)));

-- Guests place orders through the server (service role). Members can see
-- orders; managers handle printing, dispatch and corrections.
create policy "members read orders"
  on public.orders for select
  to authenticated
  using ((select public.is_event_member(event_id)));

create policy "managers manage orders"
  on public.orders for all
  to authenticated
  using ((select public.is_event_manager(event_id)))
  with check ((select public.is_event_manager(event_id)));

create policy "members read order items"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (select public.is_event_member(o.event_id))
    )
  );

create policy "managers manage order items"
  on public.order_items for all
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (select public.is_event_manager(o.event_id))
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (select public.is_event_manager(o.event_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: photos live at "<organization id>/<event id>/<file>".
-- ---------------------------------------------------------------------------

create or replace function public.storage_path_org(path text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(path, '/', 1)::uuid
  end;
$$;

grant execute on function public.storage_path_org(text) to authenticated;

create policy "members manage their studio's photos"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))))
  with check (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))));
