-- ============================================================================
-- CUTE WEDDING POLAROID - SUPABASE DATABASE MIGRATION (PUBLIC SCHEMA)
-- ============================================================================
-- Run this script in the Supabase Dashboard -> SQL Editor -> New Query -> Run.
--
-- This script installs all tables, functions, triggers, RLS policies, and storage
-- buckets for the Cute Wedding Polaroid application into the default 'public' schema.
-- Fully idempotent (safe to re-run multiple times).
-- ============================================================================


-- ============================================================================
-- Migration: 20261025000000_init.sql
-- ============================================================================

-- Cute Wedding Polaroid: initial schema.
--
-- Access model
--   * Admins (rows in admin_users) get full access through RLS.
--   * Guests never talk to the database directly. Their gallery and order
--     pages run on the server with the service-role key and check the
--     guest's access_token first. So the anon role has no policies at all.
--
-- Money is stored in paise (integer) to avoid floating-point errors.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.event_status as enum ('draft', 'live', 'closed', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum (
  'pending',     -- placed by a guest during the order window
  'approved',    -- checked by admin, ready to print
  'printed',
  'dispatched',  -- handed to the courier
  'delivered',
  'cancelled'
);
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- security definer so policies can call it without recursing into
-- admin_users' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins read admin list" on public.admin_users;
create policy "admins read admin list" on public.admin_users for select
  to authenticated
  using ((select public.is_admin()));

-- Admins are added by hand (SQL editor) on purpose: no in-app escalation path.

-- ---------------------------------------------------------------------------
-- Events (one per wedding)
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique
                          check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                                 and char_length(slug) between 3 and 60),
  couple_names          text not null check (char_length(couple_names) between 1 and 120),
  venue                 text,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  -- Guests can order prints only between these two times.
  orders_open_at        timestamptz,
  orders_close_at       timestamptz,
  -- Photos are deleted after this time (default: 7 days after the event).
  gallery_expires_at    timestamptz not null,
  status                public.event_status not null default 'draft',
  -- Colours, fonts and frame style for the event's pages and prints.
  theme                 jsonb not null default '{}'::jsonb,
  -- What the couple pays per printed copy.
  print_price_paise     integer not null default 0 check (print_price_paise >= 0),
  -- Optional limits the couple agrees to up front.
  max_copies_per_guest  integer check (max_copies_per_guest > 0),
  budget_cap_paise      integer check (budget_cap_paise >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint events_time_order check (ends_at > starts_at),
  constraint events_window_order check (
    orders_open_at is null or orders_close_at is null or orders_close_at > orders_open_at
  ),
  constraint events_expiry_after_end check (gallery_expires_at >= ends_at)
);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;

drop policy if exists "admins manage events" on public.events;
create policy "admins manage events" on public.events for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Guests (one per phone number per event)
-- ---------------------------------------------------------------------------

create table if not exists public.guests (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  -- Short code shown to the guest and typed by the operator before a shot,
  -- e.g. "A17". Letters I and O are excluded to avoid confusion with 1 and 0.
  code          text not null check (code ~ '^[A-HJ-NP-Z][0-9]{2}$'),
  phone_e164    text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  name          text check (char_length(name) <= 120),
  -- When the guest agreed to us storing their number and photos.
  consent_at    timestamptz not null,
  -- Secret in the guest's private gallery link.
  access_token  text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at    timestamptz not null default now(),
  unique (event_id, code),
  unique (event_id, phone_e164)
);

create index if not exists guests_event_id_idx on public.guests (event_id);

alter table public.guests enable row level security;

drop policy if exists "admins manage guests" on public.guests;
create policy "admins manage guests" on public.guests for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  guest_id      uuid references public.guests (id) on delete set null,
  -- Path inside the private "event-photos" storage bucket.
  storage_path  text not null unique,
  width         integer check (width > 0),
  height        integer check (height > 0),
  captured_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  -- Set when the file is purged after gallery_expires_at; the row stays so
  -- order history keeps working.
  deleted_at    timestamptz
);

create index if not exists photos_event_id_idx on public.photos (event_id);
create index if not exists photos_guest_id_idx on public.photos (guest_id);

alter table public.photos enable row level security;

drop policy if exists "admins manage photos" on public.photos;
create policy "admins manage photos" on public.photos for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Orders (one delivery address = one order)
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.events (id) on delete cascade,
  guest_id              uuid not null references public.guests (id) on delete restrict,
  status                public.order_status not null default 'pending',
  recipient_name        text not null check (char_length(recipient_name) between 1 and 120),
  phone_e164            text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  address_line1         text not null check (char_length(address_line1) between 1 and 200),
  address_line2         text check (char_length(address_line2) <= 200),
  city                  text not null check (char_length(city) between 1 and 80),
  state                 text not null check (char_length(state) between 1 and 80),
  pincode               text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  courier_name          text,
  tracking_number       text,
  -- Actual courier cost, entered by admin at dispatch; billed to the couple.
  courier_charge_paise  integer not null default 0 check (courier_charge_paise >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  dispatched_at         timestamptz,
  delivered_at          timestamptz
);

create index if not exists orders_event_id_idx on public.orders (event_id);
create index if not exists orders_guest_id_idx on public.orders (guest_id);
create index if not exists orders_status_idx on public.orders (status);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

drop policy if exists "admins manage orders" on public.orders;
create policy "admins manage orders" on public.orders for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create table if not exists public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  photo_id          uuid not null references public.photos (id) on delete restrict,
  copies            integer not null check (copies between 1 and 50),
  -- Price snapshot at order time, so later price edits don't change bills.
  unit_price_paise  integer not null check (unit_price_paise >= 0),
  unique (order_id, photo_id)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_photo_id_idx on public.order_items (photo_id);

alter table public.order_items enable row level security;

drop policy if exists "admins manage order items" on public.order_items;
create policy "admins manage order items" on public.order_items for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Couple's statement: everything billed for one event.
-- security_invoker makes the view respect the caller's RLS.
-- ---------------------------------------------------------------------------

create or replace view public.event_statements
with (security_invoker = true)
as
with active_orders as (
  select o.id, o.event_id, o.courier_charge_paise
  from public.orders o
  where o.status <> 'cancelled'
),
item_totals as (
  select ao.event_id,
         sum(oi.copies)::bigint                      as copies,
         sum(oi.copies * oi.unit_price_paise)::bigint as prints_paise
  from active_orders ao
  join public.order_items oi on oi.order_id = ao.id
  group by ao.event_id
),
courier_totals as (
  select event_id,
         count(*)::bigint                    as orders,
         sum(courier_charge_paise)::bigint   as courier_paise
  from active_orders
  group by event_id
)
select e.id                                      as event_id,
       e.slug,
       e.couple_names,
       coalesce(c.orders, 0)                     as order_count,
       coalesce(i.copies, 0)                     as copies,
       coalesce(i.prints_paise, 0)               as prints_paise,
       coalesce(c.courier_paise, 0)              as courier_paise,
       coalesce(i.prints_paise, 0)
         + coalesce(c.courier_paise, 0)          as total_paise,
       e.budget_cap_paise
from public.events e
left join item_totals i on i.event_id = e.id
left join courier_totals c on c.event_id = e.id;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for event photos (served through signed URLs).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', false)
on conflict (id) do nothing;

drop policy if exists "admins manage event photos" on storage.objects;
create policy "admins manage event photos" on storage.objects for all
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_admin()))
  with check (bucket_id = 'event-photos' and (select public.is_admin()));

-- ============================================================================
-- Migration: 20261026000000_studios.sql
-- ============================================================================

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

do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'operator');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table if not exists public.organization_members (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             public.member_role not null default 'operator',
  created_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx on public.organization_members (user_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Events belong to a studio. Nothing is deployed yet, so no rows need a
-- backfill; if rows did exist this fails loudly instead of guessing a studio.
alter table public.events
  add column if not exists organization_id uuid not null references public.organizations (id) on delete cascade,
  add column if not exists backdrop_brief text check (char_length(backdrop_brief) <= 2000);

create index if not exists events_organization_id_idx on public.events (organization_id);

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

drop policy if exists "members read their studio" on public.organizations;
create policy "members read their studio" on public.organizations for select
  to authenticated
  using ((select public.is_org_member(id)));

drop policy if exists "managers update their studio" on public.organizations;
create policy "managers update their studio" on public.organizations for update
  to authenticated
  using ((select public.is_org_manager(id)))
  with check ((select public.is_org_manager(id)));

drop policy if exists "members read their studio's members" on public.organization_members;
create policy "members read their studio's members" on public.organization_members for select
  to authenticated
  using ((select public.is_org_member(organization_id)));

-- Only owners change membership. Owners can't change or remove their own
-- row, so a studio can't lose its last owner by accident.
drop policy if exists "owners add members" on public.organization_members;
create policy "owners add members" on public.organization_members for insert
  to authenticated
  with check (
    (select public.is_admin() or public.org_role(organization_id) = 'owner')
  );

drop policy if exists "owners change other members" on public.organization_members;
create policy "owners change other members" on public.organization_members for update
  to authenticated
  using (
    (select public.is_admin() or public.org_role(organization_id) = 'owner')
    and user_id <> (select auth.uid())
  )
  with check (
    (select public.is_admin() or public.org_role(organization_id) = 'owner')
    and user_id <> (select auth.uid())
  );

drop policy if exists "owners remove other members" on public.organization_members;
create policy "owners remove other members" on public.organization_members for delete
  to authenticated
  using (
    (select public.is_admin() or public.org_role(organization_id) = 'owner')
    and user_id <> (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Policies: replace admin-only rules with studio membership
-- ---------------------------------------------------------------------------

drop policy if exists "admins manage events" on public.events;
drop policy if exists "admins manage guests" on public.guests;
drop policy if exists "admins manage photos" on public.photos;
drop policy if exists "admins manage orders" on public.orders;
drop policy if exists "admins manage order items" on public.order_items;
drop policy if exists "admins manage event photos" on storage.objects;

drop policy if exists "members read events" on public.events;
create policy "members read events" on public.events for select
  to authenticated
  using ((select public.is_org_member(organization_id)));

drop policy if exists "managers create events" on public.events;
create policy "managers create events" on public.events for insert
  to authenticated
  with check ((select public.is_org_manager(organization_id)));

drop policy if exists "managers update events" on public.events;
create policy "managers update events" on public.events for update
  to authenticated
  using ((select public.is_org_manager(organization_id)))
  with check ((select public.is_org_manager(organization_id)));

drop policy if exists "managers delete events" on public.events;
create policy "managers delete events" on public.events for delete
  to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Operators capture at the event, so every member can add guests and photos.
drop policy if exists "members manage guests" on public.guests;
create policy "members manage guests" on public.guests for all
  to authenticated
  using ((select public.is_event_member(event_id)))
  with check ((select public.is_event_member(event_id)));

drop policy if exists "members manage photos" on public.photos;
create policy "members manage photos" on public.photos for all
  to authenticated
  using ((select public.is_event_member(event_id)))
  with check ((select public.is_event_member(event_id)));

-- Guests place orders through the server (service role). Members can see
-- orders; managers handle printing, dispatch and corrections.
drop policy if exists "members read orders" on public.orders;
create policy "members read orders" on public.orders for select
  to authenticated
  using ((select public.is_event_member(event_id)));

drop policy if exists "managers manage orders" on public.orders;
create policy "managers manage orders" on public.orders for all
  to authenticated
  using ((select public.is_event_manager(event_id)))
  with check ((select public.is_event_manager(event_id)));

drop policy if exists "members read order items" on public.order_items;
create policy "members read order items" on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (select public.is_event_member(o.event_id))
    )
  );

drop policy if exists "managers manage order items" on public.order_items;
create policy "managers manage order items" on public.order_items for all
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

drop policy if exists "members manage their studio's photos" on storage.objects;
create policy "members manage their studio's photos" on storage.objects for all
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))))
  with check (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))));

-- ============================================================================
-- Migration: 20261026100000_capture.sql
-- ============================================================================

-- Capture and guest gallery.
--
-- * guests.link_sent_at: when the operator sent the guest their gallery link.
-- * photos.thumb_path: a small copy for fast galleries; storage_path stays
--   the full-size photo used for downloads and prints.
-- * photos.created_by: which team member captured it.
-- * The photo bucket only accepts images up to 15 MB.

alter table public.guests
  add column if not exists link_sent_at timestamptz;

alter table public.photos
  add column if not exists thumb_path text unique,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Both files of a photo must live in the event's own folder:
-- "<organization id>/<event id>/…". Checked here as well as in the app.
create or replace function public.photo_paths_match_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prefix text;
begin
  select e.organization_id::text || '/' || e.id::text || '/'
    into prefix
    from public.events e
    where e.id = new.event_id;

  if prefix is null
     or left(new.storage_path, length(prefix)) <> prefix
     or (new.thumb_path is not null and left(new.thumb_path, length(prefix)) <> prefix) then
    raise exception 'Photo files must be stored under %', coalesce(prefix, 'the event folder')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists photos_paths_match_event on public.photos;
create trigger photos_paths_match_event before insert or update of storage_path, thumb_path, event_id on public.photos
  for each row execute function public.photo_paths_match_event();

-- A photo's guest must belong to the same event.
create or replace function public.photo_guest_matches_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.guest_id is not null and not exists (
    select 1 from public.guests g where g.id = new.guest_id and g.event_id = new.event_id
  ) then
    raise exception 'Guest does not belong to this event' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists photos_guest_matches_event on public.photos;
create trigger photos_guest_matches_event before insert or update of guest_id, event_id on public.photos
  for each row execute function public.photo_guest_matches_event();

update storage.buckets
set file_size_limit = 15 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'event-photos';

-- ============================================================================
-- Migration: 20261028000000_platform_admin.sql
-- ============================================================================

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
  add column if not exists mfa_factor_id   uuid,
  add column if not exists mfa_setup_until timestamptz default (now() + interval '1 hour');

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

drop trigger if exists admin_users_fresh_setup on public.admin_users;
create trigger admin_users_fresh_setup before insert or update on public.admin_users
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

do $$ begin
  create type public.studio_status as enum ('trialing', 'active', 'past_due', 'suspended');
exception
  when duplicate_object then null;
end $$;

alter table public.organizations drop constraint if exists organizations_suspension_consistent;
alter table public.organizations
  add column if not exists status           public.studio_status not null default 'trialing',
  add column if not exists trial_ends_at    timestamptz not null default (now() + interval '14 days'),
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text check (char_length(suspended_reason) <= 500),
  add constraint organizations_suspension_consistent check (
    (status = 'suspended') = (suspended_at is not null)
  );

create index if not exists organizations_status_idx on public.organizations (status);

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

drop trigger if exists organizations_guard_status on public.organizations;
create trigger organizations_guard_status before update on public.organizations
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

drop trigger if exists events_block_suspended on public.events;
create trigger events_block_suspended before insert or update of status on public.events
  for each row execute function public.block_suspended_studio();

drop trigger if exists guests_block_suspended on public.guests;
create trigger guests_block_suspended before insert or update on public.guests
  for each row execute function public.block_suspended_studio();

drop trigger if exists photos_block_suspended on public.photos;
create trigger photos_block_suspended before insert or update on public.photos
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

drop trigger if exists events_keep_studio on public.events;
create trigger events_keep_studio before update of organization_id on public.events
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
drop policy if exists "members manage their studio's photos" on storage.objects;

drop policy if exists "members read their studio's photos" on storage.objects;
create policy "members read their studio's photos" on storage.objects for select
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))));

drop policy if exists "members delete their studio's photos" on storage.objects;
create policy "members delete their studio's photos" on storage.objects for delete
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))));

drop policy if exists "active members upload photos" on storage.objects;
create policy "active members upload photos" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and not (select public.is_studio_suspended(public.storage_path_org(name)))
  );

drop policy if exists "active members replace photos" on storage.objects;
create policy "active members replace photos" on storage.objects for update
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
create table if not exists public.admin_audit_log (
  id               bigint generated always as identity primary key,
  actor_id         uuid,
  actor_email      text,
  action           text not null check (char_length(action) between 1 and 60),
  organization_id  uuid,
  studio_name      text,
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_organization_idx on public.admin_audit_log (organization_id, created_at desc);

alter table public.admin_audit_log enable row level security;

-- Read-only for admins. Rows are written only by the admin functions, and
-- nobody can edit or delete them through the API.
drop policy if exists "admins read audit log" on public.admin_audit_log;
create policy "admins read audit log" on public.admin_audit_log for select
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

drop function if exists public.admin_studios(text, public.studio_status, uuid);
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

-- ============================================================================
-- Migration: 20261030000000_plans.sql
-- ============================================================================

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
--   cut off halfway, but never more than 3 days after access ran out (so
--   editing an end date can't keep capture open). Suspension (previous
--   migration) still stops everything. Errors carry hint 'studio_access'.
-- * Events that have been live are archived, not deleted, so a month's
--   event count can't be reset by deleting finished weddings.
-- * Payments are recorded by admins for now (UPI, bank, cash). Razorpay can
--   insert the same rows later; (method, reference) is unique so a webhook
--   can't record one payment twice.
-- * Studios ask to upgrade with request_plan(); admins see open requests.

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------

create table if not exists public.plans (
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
create unique index if not exists plans_one_trial on public.plans (is_trial) where is_trial;

insert into public.plans (id, name, price_paise, events_per_month, photos_per_event, team_seats, gallery_days, remove_branding, is_trial, sort) values
  ('trial',   'Trial',   0,      1,  300,  2,  7,  false, true,  0),
  ('starter', 'Starter', 149900, 4,  1500, 3,  7,  false, false, 1),
  ('pro',     'Pro',     399900, 15, 5000, 10, 30, true,  false, 2) on conflict (id) do nothing;

alter table public.plans enable row level security;

-- Plans are public information (the pricing table).
drop policy if exists "anyone reads plans" on public.plans;
create policy "anyone reads plans" on public.plans for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Studio plan and paid-until date
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists plan_id    text not null default 'trial' references public.plans (id),
  add column if not exists paid_until timestamptz;

create index if not exists organizations_plan_id_idx on public.organizations (plan_id);

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

-- When a blocked studio's access ran out: the trial's end, or the end of
-- the payment grace period. Null while access is fine.
create or replace function public.access_ended_at(
  p_status public.studio_status,
  p_trial_ends_at timestamptz,
  p_paid_until timestamptz
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case public.access_for(p_status, p_trial_ends_at, p_paid_until)
    when 'trial_ended' then p_trial_ends_at
    when 'payment_overdue' then coalesce(p_paid_until + public.payment_grace(), p_trial_ends_at)
  end;
$$;

-- Can photos be taken at this event right now? Always while access is fine.
-- After access runs out, only at an event that is live, until 12 hours after
-- it ends and at most 3 days after access ran out. Never when suspended.
-- Members only (false for anyone else).
create or replace function public.capture_open(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case public.access_for(o.status, o.trial_ends_at, o.paid_until)
      when 'ok' then true
      when 'payment_due' then true
      when 'suspended' then false
      else e.status = 'live'
        and now() <= least(
          e.ends_at + interval '12 hours',
          public.access_ended_at(o.status, o.trial_ends_at, o.paid_until) + interval '3 days'
        )
    end
    from public.events e
    join public.organizations o on o.id = e.organization_id
    where e.id = p_event and public.is_org_member(e.organization_id)
  ), false);
$$;

revoke all on function public.capture_open(uuid) from public, anon;
grant execute on function public.capture_open(uuid) to authenticated;

-- Replaces the suspension-only rule from the previous migration.
create or replace function public.block_suspended_studio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  access text;
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  -- Hiding a photo (for example when a guest asks) is always allowed.
  -- Un-hiding is not: it goes through the same checks as adding one.
  -- (Read through jsonb: this trigger also runs on tables without deleted_at.)
  if tg_table_name = 'photos' and tg_op = 'UPDATE'
     and to_jsonb(old) ->> 'deleted_at' is null and to_jsonb(new) ->> 'deleted_at' is not null
     and (to_jsonb(new) - 'deleted_at') = (to_jsonb(old) - 'deleted_at') then
    return new;
  end if;

  if tg_table_name = 'events' then
    -- Editing an event is fine; creating one or going live needs access.
    if tg_op = 'UPDATE' and not (new.status = 'live' and old.status is distinct from 'live') then
      return new;
    end if;
    access := public.studio_access(new.organization_id);
    if access = 'suspended' then
      raise exception 'This studio is suspended. Contact support to reactivate it.'
        using errcode = '42501', hint = 'studio_access';
    elsif access = 'trial_ended' then
      raise exception 'Your trial has ended. Choose a plan to start new events.'
        using errcode = '42501', hint = 'studio_access';
    elsif access = 'payment_overdue' then
      raise exception 'Your payment is overdue. Settle it to start new events.'
        using errcode = '42501', hint = 'studio_access';
    end if;
    return new;
  end if;

  -- Guests and photos.
  if public.capture_open(new.event_id) then
    return new;
  end if;
  access := (select public.studio_access(e.organization_id) from public.events e where e.id = new.event_id);
  if access = 'suspended' then
    raise exception 'This studio is suspended. Contact support to reactivate it.'
      using errcode = '42501', hint = 'studio_access';
  elsif access = 'trial_ended' then
    raise exception 'Your trial has ended. Choose a plan to start new events.'
      using errcode = '42501', hint = 'studio_access';
  end if;
  raise exception 'Your payment is overdue. Settle it to start new events.'
    using errcode = '42501', hint = 'studio_access';
end;
$$;

-- Photos never move between events, and events that have been live are
-- archived rather than deleted, so neither can be used to get round limits.
create or replace function public.keep_photo_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin()
     and new.event_id is distinct from old.event_id then
    raise exception 'Photos can''t be moved to another event' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists photos_keep_event on public.photos;
create trigger photos_keep_event before update of event_id on public.photos
  for each row execute function public.keep_photo_event();

create or replace function public.keep_live_events()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() and old.status <> 'draft' then
    raise exception 'Events that have been live can''t be deleted. Archive it instead.' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists events_keep_live on public.events;
create trigger events_keep_live before delete on public.events
  for each row execute function public.keep_live_events();

-- Event rules for studio users (admins and server code are not limited):
-- * status moves only along draft -> live -> closed -> archived, with
--   closed <-> live and archived -> closed (same as the app);
-- * an event lasts at most 7 days, and goes live at most a day before it
--   starts, so dates can't be used to dodge the monthly event count;
-- * once an event has been live its start is fixed, so its gallery (measured
--   from its end) can't be stretched by moving it;
-- * guests and photos are only added to a live event.
create or replace function public.enforce_event_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status = 'live')
    or (old.status = 'live' and new.status = 'closed')
    or (old.status = 'closed' and new.status in ('live', 'archived'))
    or (old.status = 'archived' and new.status = 'closed')
  ) then
    raise exception 'A % event can''t move to %.', old.status, new.status using errcode = '22023', hint = 'event_rule';
  end if;

  if new.ends_at - new.starts_at > interval '7 days' then
    raise exception 'An event can last up to 7 days.' using errcode = '22023', hint = 'event_rule';
  end if;

  if tg_op = 'UPDATE' and old.status <> 'draft' and new.starts_at is distinct from old.starts_at then
    raise exception 'The start can''t change once an event has been live.' using errcode = '22023', hint = 'event_rule';
  end if;

  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live')
     and now() < new.starts_at - interval '1 day' then
    raise exception 'An event can go live from a day before it starts. For a test run, set its date to today.'
      using errcode = '22023', hint = 'event_rule';
  end if;

  return new;
end;
$$;

drop trigger if exists events_enforce_rules on public.events;
create trigger events_enforce_rules before insert or update on public.events
  for each row execute function public.enforce_event_rules();

create or replace function public.require_live_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if not exists (select 1 from public.events e where e.id = new.event_id and e.status = 'live') then
    raise exception 'Guests and photos can only be added while the event is live.' using errcode = '22023', hint = 'event_rule';
  end if;
  return new;
end;
$$;

drop trigger if exists guests_require_live_event on public.guests;
create trigger guests_require_live_event before insert on public.guests
  for each row execute function public.require_live_event();

drop trigger if exists photos_require_live_event on public.photos;
create trigger photos_require_live_event before insert on public.photos
  for each row execute function public.require_live_event();

-- Storage: a file may go into an event's folder only while capture is open
-- there. Paths are "<studio>/<event>/<guest>/<file>".
create or replace function public.can_upload_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_path, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      exists (
        select 1 from public.events e
        where e.id = split_part(p_path, '/', 2)::uuid
          and e.organization_id = public.storage_path_org(p_path)
      ) and public.capture_open(split_part(p_path, '/', 2)::uuid)
    else false
  end;
$$;

revoke all on function public.can_upload_photo(text) from public, anon;
grant execute on function public.can_upload_photo(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Limits
-- ---------------------------------------------------------------------------

-- The next plan up that allows more of something, for the error message.
create or replace function public.upgrade_hint(p_column text, p_current integer, p_unit text)
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
  return format(' Upgrade to %s for %s %s.', next_plan.name, to_char(next_plan.amount, 'FM999,999,999'), p_unit);
end;
$$;

revoke all on function public.upgrade_hint(text, integer, text) from public, anon, authenticated;

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

  -- Events per month, by the event's own date in India time. Checked when an
  -- event is added or moves to another month, so a studio over a lowered
  -- limit can still edit the events it has.
  month_start := date_trunc('month', new.starts_at at time zone 'Asia/Kolkata');
  if tg_op = 'INSERT' or month_start is distinct from date_trunc('month', old.starts_at at time zone 'Asia/Kolkata') then
    select count(*) into used
    from public.events e
    where e.organization_id = new.organization_id
      and e.id <> new.id
      and date_trunc('month', e.starts_at at time zone 'Asia/Kolkata') = month_start;
    if used >= plan.events_per_month then
      perform public.raise_plan_limit(format(
        'You''ve used %s of %s events for %s on the %s plan.%s',
        used, plan.events_per_month, to_char(month_start, 'FMMonth YYYY'), plan.name,
        public.upgrade_hint('events_per_month', plan.events_per_month, 'events a month')
      ));
    end if;
  end if;

  -- Gallery length, when it's set or made longer.
  if (tg_op = 'INSERT' or (new.gallery_expires_at - new.ends_at) > (old.gallery_expires_at - old.ends_at))
     and new.gallery_expires_at > new.ends_at + make_interval(days => plan.gallery_days) + interval '1 hour' then
    perform public.raise_plan_limit(format(
      'The %s plan keeps galleries for up to %s days.%s',
      plan.name, plan.gallery_days, public.upgrade_hint('gallery_days', plan.gallery_days, 'days')
    ));
  end if;

  return new;
end;
$$;

drop trigger if exists events_enforce_limits on public.events;
create trigger events_enforce_limits before insert or update of starts_at, gallery_expires_at, ends_at on public.events
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
  -- Only a photo becoming visible counts: added, or un-hidden.
  if tg_op = 'UPDATE' and not (old.deleted_at is not null and new.deleted_at is null) then
    return new;
  end if;

  select p.* into plan
  from public.events e
  join public.organizations o on o.id = e.organization_id
  join public.plans p on p.id = o.plan_id
  where e.id = new.event_id;

  -- One count per event at a time, so parallel uploads can't overshoot.
  perform pg_advisory_xact_lock(hashtext('photos:' || new.event_id::text));
  select count(*) into used from public.photos where event_id = new.event_id and deleted_at is null and id <> new.id;
  if used >= plan.photos_per_event then
    perform public.raise_plan_limit(format(
      'This event has reached %s photos, the most the %s plan allows.%s',
      to_char(plan.photos_per_event, 'FM999,999,999'), plan.name,
      public.upgrade_hint('photos_per_event', plan.photos_per_event, 'photos per event')
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists photos_enforce_limit on public.photos;
create trigger photos_enforce_limit before insert or update of deleted_at on public.photos
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
      plan.name, plan.team_seats, public.upgrade_hint('team_seats', plan.team_seats, 'seats')
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists organization_members_enforce_seats on public.organization_members;
create trigger organization_members_enforce_seats before insert on public.organization_members
  for each row execute function public.enforce_seat_limit();

revoke all on function public.enforce_event_limits() from public, anon, authenticated;
revoke all on function public.enforce_photo_limit() from public, anon, authenticated;
revoke all on function public.enforce_seat_limit() from public, anon, authenticated;
revoke all on function public.raise_plan_limit(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.payment_method as enum ('upi', 'bank_transfer', 'cash', 'razorpay', 'other');
exception
  when duplicate_object then null;
end $$;

-- Financial records outlive studios: deleting a studio with payments is
-- refused until account deletion handles it explicitly.
create table if not exists public.payments (
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

create index if not exists payments_organization_idx on public.payments (organization_id, created_at desc);
create unique index if not exists payments_method_reference_key on public.payments (method, reference) where reference is not null;

alter table public.payments enable row level security;

drop policy if exists "managers read their payments" on public.payments;
create policy "managers read their payments" on public.payments for select
  to authenticated
  using ((select public.is_org_manager(organization_id)));

-- ---------------------------------------------------------------------------
-- Upgrade requests
-- ---------------------------------------------------------------------------

create table if not exists public.plan_requests (
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

create unique index if not exists plan_requests_one_open on public.plan_requests (organization_id) where status = 'open';

alter table public.plan_requests enable row level security;

drop policy if exists "managers read their requests" on public.plan_requests;
create policy "managers read their requests" on public.plan_requests for select
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

  -- Paying early for the same plan extends it; a new plan starts today (any
  -- difference for unused time is settled by hand).
  starts := case
    when org.plan_id = p_plan then greatest(coalesce(org.paid_until, now()), now())
    else now()
  end;
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
-- Storage: uploads follow the same capture rule as photo rows
-- ---------------------------------------------------------------------------

drop policy if exists "active members upload photos" on storage.objects;
drop policy if exists "active members replace photos" on storage.objects;

drop policy if exists "active members upload photos" on storage.objects;
create policy "active members upload photos" on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and (select public.can_upload_photo(name))
  );

drop policy if exists "active members replace photos" on storage.objects;
create policy "active members replace photos" on storage.objects for update
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_org_member(public.storage_path_org(name))))
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and (select public.can_upload_photo(name))
  );

-- ============================================================================
-- Migration: 20261111000000_projects.sql
-- ============================================================================

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
-- * The gallery link token is always made here, never chosen by a caller.
--   A studio can swap it for a new one (any change to it makes a fresh
--   random token), so a leaked link can be killed.
-- * Each project folder holds at most 2 files per allowed photo, plus a
--   little slack, and only "<uuid>.jpg" / "<uuid>.thumb.jpg" names, so storage
--   can't be filled outside the photo limit.
-- * File names of deleted photos are remembered, so re-dropping the folder or
--   restarting the PC app doesn't bring them back.
-- * The PC worker authenticates with a worker token. The app makes the token,
--   shows it once and stores only its SHA-256 hash; it never reaches the
--   database.

do $$ begin
  create type public.project_status as enum ('draft', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;
do $$ begin
  create type public.project_kind as enum ('wedding', 'birthday', 'concert', 'outdoor', 'portrait', 'corporate', 'other');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
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

create index if not exists projects_organization_idx on public.projects (organization_id, created_at desc);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table if not exists public.project_photos (
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

create index if not exists project_photos_order_idx on public.project_photos (project_id, taken_at, file_name);

create table if not exists public.worker_tokens (
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

create index if not exists worker_tokens_organization_idx on public.worker_tokens (organization_id, created_at desc);

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

-- A gallery link token: 48 hex characters from two random UUIDs (about 180
-- random bits). gen_random_uuid() is built in, so no extension schema needed.
create or replace function public.new_link_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select left(replace(pg_catalog.gen_random_uuid()::text || pg_catalog.gen_random_uuid()::text, '-', ''), 48);
$$;

revoke all on function public.new_link_token() from public, anon, authenticated;

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

    -- Set here, never by the caller: the month it counts toward, who made it,
    -- and an unguessable link token.
    new.created_at := now();
    new.created_by := auth.uid();
    new.access_token := public.new_link_token();

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

  -- UPDATE. The studio and publish dates are never set directly. Asking for
  -- a different link token gets a fresh random one.
  if by_studio then
    new.organization_id := old.organization_id;
    if new.access_token is distinct from old.access_token then
      new.access_token := public.new_link_token();
    end if;
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

drop trigger if exists projects_enforce_rules on public.projects;
create trigger projects_enforce_rules before insert or update on public.projects
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

drop trigger if exists projects_keep_published on public.projects;
create trigger projects_keep_published before delete on public.projects
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

drop trigger if exists project_photos_enforce_rules on public.project_photos;
create trigger project_photos_enforce_rules before insert or update on public.project_photos
  for each row execute function public.enforce_project_photo_rules();

-- ---------------------------------------------------------------------------
-- Deleted photos stay deleted
-- ---------------------------------------------------------------------------

-- The uploaders skip these names, so a deleted shot doesn't come back when
-- the folder is dropped again or the PC app restarts.
create table if not exists public.project_removed_files (
  project_id  uuid not null references public.projects (id) on delete cascade,
  file_name   text not null,
  removed_at  timestamptz not null default now(),
  primary key (project_id, file_name)
);

create or replace function public.remember_removed_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Not when the whole project is going (the cascade would fail).
  if exists (select 1 from public.projects where id = old.project_id) then
    insert into public.project_removed_files (project_id, file_name)
    values (old.project_id, old.file_name)
    on conflict do nothing;
  end if;
  return old;
end;
$$;

revoke all on function public.remember_removed_photo() from public, anon, authenticated;

drop trigger if exists project_photos_remember_removed on public.project_photos;
create trigger project_photos_remember_removed after delete on public.project_photos
  for each row execute function public.remember_removed_photo();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_photos enable row level security;
alter table public.worker_tokens enable row level security;
alter table public.project_removed_files enable row level security;

drop policy if exists "members read removed file names" on public.project_removed_files;
create policy "members read removed file names" on public.project_removed_files for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and (select public.is_org_member(p.organization_id))
  ));

drop policy if exists "members read their projects" on public.projects;
create policy "members read their projects" on public.projects for select to authenticated
  using ((select public.is_org_member(organization_id)));

drop policy if exists "managers create projects" on public.projects;
create policy "managers create projects" on public.projects for insert to authenticated
  with check ((select public.is_org_manager(organization_id)));

drop policy if exists "managers update projects" on public.projects;
create policy "managers update projects" on public.projects for update to authenticated
  using ((select public.is_org_manager(organization_id)))
  with check ((select public.is_org_manager(organization_id)));

drop policy if exists "managers delete projects" on public.projects;
create policy "managers delete projects" on public.projects for delete to authenticated
  using ((select public.is_org_manager(organization_id)));

drop policy if exists "members read project photos" on public.project_photos;
create policy "members read project photos" on public.project_photos for select to authenticated
  using ((select public.is_org_member(organization_id)));

-- organization_id is filled in from the project by the trigger, so the check
-- is on the project the photo goes into.
drop policy if exists "members add project photos" on public.project_photos;
create policy "members add project photos" on public.project_photos for insert to authenticated
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and (select public.is_org_member(p.organization_id))
  ));

drop policy if exists "members hide project photos" on public.project_photos;
create policy "members hide project photos" on public.project_photos for update to authenticated
  using ((select public.is_org_member(organization_id)))
  with check ((select public.is_org_member(organization_id)));

drop policy if exists "managers delete project photos" on public.project_photos;
create policy "managers delete project photos" on public.project_photos for delete to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Tokens are created and revoked only through the functions below.
drop policy if exists "managers see their worker tokens" on public.worker_tokens;
create policy "managers see their worker tokens" on public.worker_tokens for select to authenticated
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

-- Files a project folder may hold: 2 per allowed photo (web size and
-- thumbnail) plus slack for uploads in flight. Checked before every browser
-- upload and before the worker API hands out upload links.
create or replace function public.project_has_file_room(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (
      select count(*) from storage.objects so
      where so.bucket_id = 'project-photos'
        and so.name like p.organization_id::text || '/' || p.id::text || '/%'
    ) < 2 * pl.photos_per_event + 50
    from public.projects p
    join public.organizations o on o.id = p.organization_id
    join public.plans pl on pl.id = o.plan_id
    where p.id = p_project
  ), false);
$$;

-- Server code (the worker API, as the service role) keeps EXECUTE.
revoke all on function public.project_has_file_room(uuid) from public, anon, authenticated;

-- A browser may upload "<studio>/<project>/<uuid>.jpg" or ".thumb.jpg" only,
-- into a project of the uploader's studio that isn't archived and has room,
-- while the studio may start work.
create or replace function public.can_upload_project_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_path ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.thumb)?\.jpg$' then
      coalesce((
        select public.is_org_member(p.organization_id)
          and public.access_for(o.status, o.trial_ends_at, o.paid_until) in ('ok', 'payment_due')
          and public.project_has_file_room(p.id)
        from public.projects p
        join public.organizations o on o.id = p.organization_id
        where p.id = split_part(p_path, '/', 2)::uuid
          and p.organization_id = public.storage_path_org(p_path)
          and p.status <> 'archived'
      ), false)
    else false
  end;
$$;

revoke all on function public.can_upload_project_photo(text) from public, anon;
grant execute on function public.can_upload_project_photo(text) to authenticated;

drop policy if exists "members read project files" on storage.objects;
create policy "members read project files" on storage.objects for select to authenticated
  using (bucket_id = 'project-photos' and (select public.is_org_member(public.storage_path_org(name))));

drop policy if exists "members upload project files" on storage.objects;
create policy "members upload project files" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-photos' and (select public.can_upload_project_photo(name)));

drop policy if exists "managers delete project files" on storage.objects;
create policy "managers delete project files" on storage.objects for delete to authenticated
  using (bucket_id = 'project-photos' and (select public.is_org_manager(public.storage_path_org(name))));

-- ============================================================================
-- Migration: 20261112000000_photo_looks.sql
-- ============================================================================

-- Auto-edited photos. The PC app reads each photo's light, picks one of 25
-- looks and uploads two versions: the plain web-size photo (as before) and
-- the edited one. Keeping the plain copy lets the look be swapped later in the
-- browser without the photographer's computer.
--
-- * project_photos gains the edited files' paths, the kind of light it was
--   shot in and the look applied. Both edited paths are set or neither is.
-- * Edited files sit next to the plain ones: "<photo>.edit.jpg" and
--   "<photo>.edit.thumb.jpg". The storage name rule and the per-project file
--   cap (now 4 files per allowed photo, plus slack) allow for them.
-- * Guests see the edited version when there is one.

alter table public.project_photos drop constraint if exists project_photos_edit_pair, drop constraint if exists project_photos_look_needs_edit;
alter table public.project_photos
  add column if not exists edited_path        text unique,
  add column if not exists edited_thumb_path  text unique,
  add column if not exists lighting           text check (lighting in ('daylight', 'golden', 'indoor', 'stage', 'night')),
  add column if not exists look               text check (look ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(look) <= 40),
  add constraint project_photos_edit_pair check ((edited_path is null) = (edited_thumb_path is null)),
  add constraint project_photos_look_needs_edit check (look is null or edited_path is not null);

-- Edited files must be in the project's folder too (the plain paths are
-- checked by enforce_project_photo_rules).
create or replace function public.check_edited_photo_paths()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
begin
  if new.edited_path is null then
    return new;
  end if;
  select p.organization_id::text || '/' || p.id::text || '/' into base from public.projects p where p.id = new.project_id;
  if base is null
     or left(new.edited_path, char_length(base)) <> base
     or left(new.edited_thumb_path, char_length(base)) <> base then
    raise exception 'Photo paths must be inside the project''s folder' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.check_edited_photo_paths() from public, anon, authenticated;

drop trigger if exists project_photos_check_edited_paths on public.project_photos;
create trigger project_photos_check_edited_paths before insert or update of edited_path, edited_thumb_path on public.project_photos
  for each row execute function public.check_edited_photo_paths();

-- Storage: up to 4 files per allowed photo now.
create or replace function public.project_has_file_room(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (
      select count(*) from storage.objects so
      where so.bucket_id = 'project-photos'
        and so.name like p.organization_id::text || '/' || p.id::text || '/%'
    ) < 4 * pl.photos_per_event + 50
    from public.projects p
    join public.organizations o on o.id = p.organization_id
    join public.plans pl on pl.id = o.plan_id
    where p.id = p_project
  ), false);
$$;

revoke all on function public.project_has_file_room(uuid) from public, anon, authenticated;

create or replace function public.can_upload_project_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_path ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.edit)?(\.thumb)?\.jpg$' then
      coalesce((
        select public.is_org_member(p.organization_id)
          and public.access_for(o.status, o.trial_ends_at, o.paid_until) in ('ok', 'payment_due')
          and public.project_has_file_room(p.id)
        from public.projects p
        join public.organizations o on o.id = p.organization_id
        where p.id = split_part(p_path, '/', 2)::uuid
          and p.organization_id = public.storage_path_org(p_path)
          and p.status <> 'archived'
      ), false)
    else false
  end;
$$;

revoke all on function public.can_upload_project_photo(text) from public, anon;
grant execute on function public.can_upload_project_photo(text) to authenticated;

-- ============================================================================
-- Migration: 20261113000000_gallery_love.sql
-- ============================================================================

-- The client gallery: favourites, smooth loading and the studio's own logo.
--
-- * project_photos.tone: each photo's average colour, shown as a placeholder
--   while the photo loads, so the gallery never flashes empty boxes.
-- * project_photo_hearts: guests ❤ photos in a published gallery. A visitor is
--   a random id kept in their browser; hearts are written only by the server
--   after it checks the gallery link, and studios see how many each photo got
--   (great for picking album photos).
-- * organizations.logo_path: the studio's logo in the public "studio-assets"
--   bucket, shown at the top of every gallery it shares.

alter table public.project_photos
  add column if not exists tone text check (tone ~ '^#[0-9a-f]{6}$');

create table if not exists public.project_photo_hearts (
  photo_id    uuid not null references public.project_photos (id) on delete cascade,
  visitor     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (photo_id, visitor)
);

create index if not exists project_photo_hearts_visitor_idx on public.project_photo_hearts (visitor);

alter table public.project_photo_hearts enable row level security;

-- Studios read the hearts on their own photos. Nobody writes through the API
-- directly: the gallery's server code does, after checking the link.
drop policy if exists "members read hearts on their photos" on public.project_photo_hearts;
create policy "members read hearts on their photos" on public.project_photo_hearts for select to authenticated
  using (exists (
    select 1 from public.project_photos ph
    where ph.id = photo_id and (select public.is_org_member(ph.organization_id))
  ));

-- How many hearts each photo of a project has (for the studio's own view).
create or replace function public.project_heart_counts(p_project uuid)
returns table (photo_id uuid, hearts bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.id, count(h.visitor)
  from public.project_photos ph
  join public.project_photo_hearts h on h.photo_id = ph.id
  where ph.project_id = p_project
    and coalesce(public.is_org_member(ph.organization_id), false)
  group by ph.id;
$$;

revoke all on function public.project_heart_counts(uuid) from public, anon;
grant execute on function public.project_heart_counts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Studio logo
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists logo_path text check (logo_path ~ '^[0-9a-f-]{36}/logo-[0-9a-f]{8,32}\.(png|jpg|webp)$');

-- The logo must live in the studio's own folder.
create or replace function public.check_studio_logo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.logo_path is not null and split_part(new.logo_path, '/', 1) <> new.id::text then
    raise exception 'The logo must be in the studio''s own folder' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.check_studio_logo() from public, anon, authenticated;

drop trigger if exists organizations_check_logo on public.organizations;
create trigger organizations_check_logo before insert or update of logo_path on public.organizations
  for each row execute function public.check_studio_logo();

-- Public bucket: logos appear on public galleries. Images only, 2 MB max; no
-- SVG (it can carry scripts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-assets', 'studio-assets', true, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "managers upload studio assets" on storage.objects;
create policy "managers upload studio assets" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'studio-assets'
    and name ~ '^[0-9a-f-]{36}/logo-[0-9a-f]{8,32}\.(png|jpg|webp)$'
    and (select public.is_org_manager(public.storage_path_org(name)))
  );

drop policy if exists "managers delete studio assets" on storage.objects;
create policy "managers delete studio assets" on storage.objects for delete to authenticated
  using (bucket_id = 'studio-assets' and (select public.is_org_manager(public.storage_path_org(name))));

-- ============================================================================
-- Migration: 20261114000000_cleanup.sql
-- ============================================================================

-- Storage clean-up, run daily by /api/cron/cleanup (server code only).
--
-- * Photo-delivery galleries: 7 days after a gallery closes, its photos and
--   files are deleted (the project row stays, so monthly counts are right).
--   A gallery that was unpublished counts as closed when its sharing period
--   would have ended.
-- * Polaroid events: 7 days after the gallery closes, the photo files are
--   deleted and photos.deleted_at is set (rows stay for order history).
-- * Files no photo points to (an upload that never finished), once a day old.
--
-- These functions only list what to delete; the server removes the files
-- through the storage API and then the rows. None are callable from the
-- browser.

create or replace function public.cleanup_project_photos(p_limit integer default 500)
returns table (photo_id uuid, paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select ph.id, array_remove(array[ph.path, ph.thumb_path, ph.edited_path, ph.edited_thumb_path], null)
  from public.project_photos ph
  join public.projects p on p.id = ph.project_id
  join public.organizations o on o.id = p.organization_id
  join public.plans pl on pl.id = o.plan_id
  where p.first_published_at is not null
    and coalesce(p.gallery_expires_at, p.first_published_at + make_interval(days => pl.gallery_days)) < now() - interval '7 days'
  limit greatest(1, least(p_limit, 2000));
$$;

create or replace function public.cleanup_event_photos(p_limit integer default 500)
returns table (photo_id uuid, paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select ph.id, array_remove(array[ph.storage_path, ph.thumb_path], null)
  from public.photos ph
  join public.events e on e.id = ph.event_id
  where ph.deleted_at is null
    and e.gallery_expires_at < now() - interval '7 days'
  limit greatest(1, least(p_limit, 2000));
$$;

-- Files in the photo buckets that no row points to, older than a day.
create or replace function public.cleanup_orphan_files(p_limit integer default 1000)
returns table (bucket text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  (
    select so.bucket_id::text, so.name
    from storage.objects so
    where so.bucket_id = 'project-photos'
      and so.created_at < now() - interval '1 day'
      and not exists (
        select 1 from public.project_photos ph
        where so.name in (ph.path, ph.thumb_path, ph.edited_path, ph.edited_thumb_path)
      )
    limit greatest(1, least(p_limit, 5000))
  )
  union all
  (
    select so.bucket_id::text, so.name
    from storage.objects so
    where so.bucket_id = 'studio-assets'
      and so.created_at < now() - interval '1 day'
      and not exists (select 1 from public.organizations o where o.logo_path = so.name)
    limit greatest(1, least(p_limit, 5000))
  );
$$;

-- Server code only: the service role keeps its default EXECUTE grant.
revoke all on function public.cleanup_project_photos(integer) from public, anon, authenticated;
revoke all on function public.cleanup_event_photos(integer) from public, anon, authenticated;
revoke all on function public.cleanup_orphan_files(integer) from public, anon, authenticated;

-- ============================================================================
-- Migration: 20261114100000_rate_limits.sql
-- ============================================================================

-- Simple fixed-window rate limits for public and machine endpoints (gallery
-- favourites and pages, the PC app API, password resets). Counted in the
-- database so every server instance shares the same counts. Server code only.

create table if not exists public.rate_limit_hits (
  key           text not null check (char_length(key) between 1 and 200),
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limit_hits enable row level security;
-- Only the service role uses this table.
revoke all on public.rate_limit_hits from public, anon, authenticated;

-- Counts one hit and says whether it's within the limit.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limit_hits as r (key, window_start, hits)
  values (p_key, win, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  return n <= p_limit;
end;
$$;

-- Old windows are cleared by the daily clean-up.
create or replace function public.rate_limit_prune()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.rate_limit_hits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from gone;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.rate_limit_prune() from public, anon, authenticated;

-- ============================================================================
-- Migration: 20261115000000_review_and_style.sql
-- ============================================================================

-- Photo review and the studio's learnt style.
--
-- * A photographer can swap a photo's look in the browser. The new edit is
--   saved as a new pair of files, "<photo>.edit.<version>.jpg" and
--   "<photo>.edit.<version>.thumb.jpg", so no cached copy of the old edit is
--   ever shown. The old pair is removed by the server once the row points at
--   the new one (and by the daily clean-up if that step is missed).
-- * project_photos.reviewed_at marks photos the photographer has approved.
-- * studio_look_picks counts which look the studio picks for each kind of
--   light. Once one look clearly wins (3+ picks and 40%+ of that light's
--   picks), new photos in that light get it by default, in the browser and
--   in the PC app.
--
-- Row changes for both go through server code (service role) after it checks
-- the user is a member of the studio; members can still only change
-- "hidden" directly.

alter table public.project_photos add column if not exists reviewed_at timestamptz;

create index if not exists project_photos_review_idx on public.project_photos (project_id) where reviewed_at is null;

-- Versioned edit files may be uploaded too.
create or replace function public.can_upload_project_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_path ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.edit(\.[a-z0-9]{8})?)?(\.thumb)?\.jpg$' then
      coalesce((
        select public.is_org_member(p.organization_id)
          and public.access_for(o.status, o.trial_ends_at, o.paid_until) in ('ok', 'payment_due')
          and public.project_has_file_room(p.id)
        from public.projects p
        join public.organizations o on o.id = p.organization_id
        where p.id = split_part(p_path, '/', 2)::uuid
          and p.organization_id = public.storage_path_org(p_path)
          and p.status <> 'archived'
      ), false)
    else false
  end;
$$;

revoke all on function public.can_upload_project_photo(text) from public, anon;
grant execute on function public.can_upload_project_photo(text) to authenticated;

-- The studio's picks -------------------------------------------------------

create table if not exists public.studio_look_picks (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  lighting         text not null check (lighting in ('daylight', 'golden', 'indoor', 'stage', 'night')),
  look             text not null check (look ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(look) <= 40),
  picks            integer not null default 0 check (picks >= 0),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, lighting, look)
);

alter table public.studio_look_picks enable row level security;

drop policy if exists "members read look picks" on public.studio_look_picks;
create policy "members read look picks" on public.studio_look_picks for select to authenticated
  using ((select public.is_org_member(organization_id)));

-- "Forget my style" on the Studio page.
drop policy if exists "managers reset look picks" on public.studio_look_picks;
create policy "managers reset look picks" on public.studio_look_picks for delete to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Adds picks. Server code only (it checks membership first).
create or replace function public.record_look_picks(p_org uuid, p_lighting text, p_look text, p_count integer default 1)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.studio_look_picks as s (organization_id, lighting, look, picks)
  values (p_org, p_lighting, p_look, greatest(1, least(p_count, 1000)))
  on conflict (organization_id, lighting, look)
  do update set picks = s.picks + excluded.picks, updated_at = now();
$$;

revoke all on function public.record_look_picks(uuid, text, text, integer) from public, anon, authenticated;

-- The look a studio has settled on for each kind of light.
create or replace function public.studio_style(p_org uuid)
returns table (lighting text, look text, picks integer)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select s.lighting, sum(s.picks) as total from public.studio_look_picks s where s.organization_id = p_org group by s.lighting
  ),
  ranked as (
    select s.lighting, s.look, s.picks, t.total,
           row_number() over (partition by s.lighting order by s.picks desc, s.updated_at desc) as rank
    from public.studio_look_picks s
    join totals t on t.lighting = s.lighting
    where s.organization_id = p_org
  )
  select r.lighting, r.look, r.picks
  from ranked r
  where r.rank = 1 and r.picks >= 3 and r.picks >= 0.4 * r.total
    and ((select auth.role()) = 'service_role' or coalesce(public.is_org_member(p_org), false));
$$;

revoke all on function public.studio_style(uuid) from public, anon;
grant execute on function public.studio_style(uuid) to authenticated;

-- ============================================================================
-- Migration: 20261116000000_team_invites.sql
-- ============================================================================

-- Team invites: a studio owner or admin makes a private link, sends it (on
-- WhatsApp, usually), and whoever opens it while signed in joins the studio.
--
-- * Only a hash of the link's token is stored. A link works once and for
--   7 days, and can be cancelled before it's used.
-- * Owners can invite admins and operators; admins can invite operators.
-- * Joining still goes through the plan's seat limit (enforce_seat_limit).
-- * Someone who already belongs to a studio can't join a second one (the
--   app shows one studio per person).

create table if not exists public.organization_invites (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  role             public.member_role not null check (role in ('admin', 'operator')),
  label            text check (char_length(label) between 1 and 80),
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_at      timestamptz,
  accepted_by      uuid references auth.users (id) on delete set null
);

create index if not exists organization_invites_org_idx on public.organization_invites (organization_id, created_at desc);

alter table public.organization_invites enable row level security;

drop policy if exists "managers read invites" on public.organization_invites;
create policy "managers read invites" on public.organization_invites for select to authenticated
  using ((select public.is_org_manager(organization_id)));

drop policy if exists "managers cancel invites" on public.organization_invites;
create policy "managers cancel invites" on public.organization_invites for delete to authenticated
  using ((select public.is_org_manager(organization_id)) and accepted_at is null);

-- Makes an invite and returns its token (shown once, in the link).
create or replace function public.create_invite(p_org uuid, p_role public.member_role, p_label text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  my_role public.member_role := public.org_role(p_org);
  seats integer;
  used integer;
  open_invites integer;
begin
  if my_role is null or my_role not in ('owner', 'admin') then
    raise exception 'Only studio owners and admins can invite people.' using errcode = '42501', hint = 'studio_access';
  end if;
  if p_role not in ('admin', 'operator') then
    raise exception 'Invite people as an admin or an operator.' using errcode = '22023', hint = 'project_rule';
  end if;
  if p_role = 'admin' and my_role <> 'owner' then
    raise exception 'Only the studio owner can invite admins.' using errcode = '42501', hint = 'studio_access';
  end if;

  select pl.team_seats into seats from public.organizations o join public.plans pl on pl.id = o.plan_id where o.id = p_org;
  select count(*) into used from public.organization_members where organization_id = p_org;
  select count(*) into open_invites from public.organization_invites
    where organization_id = p_org and accepted_at is null and expires_at > now();
  if used >= seats then
    perform public.raise_plan_limit(format(
      'Every seat on your plan is taken (%s of %s).%s', used, seats, public.upgrade_hint('team_seats', seats, 'seats')
    ));
  end if;
  if open_invites >= 20 then
    raise exception 'Too many open invites. Cancel some first.' using errcode = '22023', hint = 'project_rule';
  end if;

  -- 48 hex characters from two random UUIDs (over 180 random bits).
  token := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48);
  insert into public.organization_invites (organization_id, role, label, token_hash, created_by)
  values (p_org, p_role, nullif(btrim(p_label), ''), encode(sha256(convert_to(token, 'UTF8')), 'hex'), (select auth.uid()));
  return token;
end;
$$;

revoke all on function public.create_invite(uuid, public.member_role, text) from public, anon;
grant execute on function public.create_invite(uuid, public.member_role, text) to authenticated;

-- What an invite link is for, so its page can say "Join <studio> as …"
-- before anyone signs in. Says nothing for a wrong token.
create or replace function public.invite_preview(p_token text)
returns table (studio_name text, role public.member_role, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.role,
         case when i.accepted_at is not null then 'used' when i.expires_at <= now() then 'expired' else 'open' end
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where p_token ~ '^[0-9a-f]{48}$'
    and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- Joins the studio behind an invite. Returns the studio's id.
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.organization_invites;
begin
  if uid is null then
    raise exception 'Sign in to accept the invite.' using errcode = '42501';
  end if;
  if p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'This invite link isn''t valid.' using errcode = '22023', hint = 'project_rule';
  end if;
  select * into inv from public.organization_invites
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    for update;
  if not found then
    raise exception 'This invite link isn''t valid.' using errcode = '22023', hint = 'project_rule';
  end if;
  if exists (select 1 from public.organization_members where user_id = uid and organization_id = inv.organization_id) then
    return inv.organization_id;
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invite has already been used. Ask for a new one.' using errcode = '22023', hint = 'project_rule';
  end if;
  if inv.expires_at <= now() then
    raise exception 'This invite has expired. Ask for a new one.' using errcode = '22023', hint = 'project_rule';
  end if;
  if exists (select 1 from public.organization_members where user_id = uid) then
    raise exception 'Your account already belongs to a studio. Sign in with another email to join this one.' using errcode = '22023', hint = 'project_rule';
  end if;

  insert into public.organization_members (organization_id, user_id, role) values (inv.organization_id, uid, inv.role);
  update public.organization_invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.organization_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- The studio's team with their email addresses (members only).
create or replace function public.studio_team(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
    and coalesce(public.is_org_member(p_org), false)
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at;
$$;

revoke all on function public.studio_team(uuid) from public, anon;
grant execute on function public.studio_team(uuid) to authenticated;

-- ============================================================================
-- Migration: 20261117000000_shot_checks.sql
-- ============================================================================

-- Missed-shot checks. The review screen measures each photo in the browser
-- (sharpness, exposure, a fingerprint for near-identical frames, and how
-- many faces have closed eyes) and saves the numbers here, so they're done
-- once. Which photos count as misses is worked out from these across the
-- whole project, in the app. Written by server code only.

alter table public.project_photos
  add column if not exists quality jsonb check (quality is null or jsonb_typeof(quality) = 'object'),
  add column if not exists checked_at timestamptz;

create index if not exists project_photos_unchecked_idx on public.project_photos (project_id) where checked_at is null;

-- ============================================================================
-- Migration: 20261118000000_razorpay.sql
-- ============================================================================

-- Self-serve payment with Razorpay.
--
-- A studio owner or admin picks a plan and how many months, the server makes
-- a Razorpay order (razorpay_orders), and Razorpay Checkout takes the payment
-- (UPI, cards, net banking). The payment is applied once, whichever arrives
-- first: the browser's confirmation (signature checked by the server) or
-- Razorpay's webhook. Applying works like a payment recorded by hand: the
-- studio moves to the plan, becomes active and is paid to the end of the
-- period. Only server code (service role) creates or applies orders.

create table if not exists public.razorpay_orders (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  plan_id           text not null references public.plans (id),
  months            integer not null check (months between 1 and 24),
  amount_paise      integer not null check (amount_paise > 0),
  order_id          text not null unique check (order_id ~ '^order_[A-Za-z0-9]{6,40}$'),
  status            text not null default 'created' check (status in ('created', 'paid')),
  payment_id        text unique check (payment_id ~ '^pay_[A-Za-z0-9]{6,40}$'),
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz
);

create index if not exists razorpay_orders_org_idx on public.razorpay_orders (organization_id, created_at desc);

alter table public.razorpay_orders enable row level security;

drop policy if exists "managers read their orders" on public.razorpay_orders;
create policy "managers read their orders" on public.razorpay_orders for select to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Applies a paid order. Safe to call twice (the second call changes nothing).
-- Returns the studio's new paid-until.
create or replace function public.apply_razorpay_payment(p_order text, p_payment text, p_amount_paise integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.razorpay_orders;
  org public.organizations;
  starts timestamptz;
  ends timestamptz;
begin
  select * into o from public.razorpay_orders where order_id = p_order for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if o.status = 'paid' then
    if o.payment_id <> p_payment then
      raise exception 'This order was already paid by another payment' using errcode = '22023';
    end if;
    select paid_until into ends from public.organizations where id = o.organization_id;
    return ends;
  end if;
  if p_amount_paise is distinct from o.amount_paise then
    raise exception 'Paid amount doesn''t match the order' using errcode = '22023';
  end if;

  select * into org from public.organizations where id = o.organization_id for update;
  starts := case
    when org.plan_id = o.plan_id then greatest(coalesce(org.paid_until, now()), now())
    else now()
  end;
  ends := starts + make_interval(months => o.months);

  insert into public.payments (organization_id, plan_id, amount_paise, method, reference, months, period_start, period_end, recorded_by)
  values (o.organization_id, o.plan_id, o.amount_paise, 'razorpay', p_payment, o.months, starts, ends, o.created_by);

  update public.organizations
  set plan_id = o.plan_id,
      paid_until = ends,
      status = case when status = 'suspended' then status else 'active' end
  where id = o.organization_id;

  update public.plan_requests
  set status = 'done', resolved_at = now()
  where organization_id = o.organization_id and status = 'open';

  update public.razorpay_orders set status = 'paid', payment_id = p_payment, paid_at = now() where id = o.id;

  perform public.write_audit(
    'studio.payment_recorded',
    o.organization_id,
    jsonb_build_object('plan', o.plan_id, 'amount_paise', o.amount_paise, 'method', 'razorpay', 'reference', p_payment, 'months', o.months, 'until', ends)
  );
  return ends;
end;
$$;

revoke all on function public.apply_razorpay_payment(text, text, integer) from public, anon, authenticated;
