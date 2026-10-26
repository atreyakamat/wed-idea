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

create type public.event_status as enum ('draft', 'live', 'closed', 'archived');

create type public.order_status as enum (
  'pending',     -- placed by a guest during the order window
  'approved',    -- checked by admin, ready to print
  'printed',
  'dispatched',  -- handed to the courier
  'delivered',
  'cancelled'
);

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

create table public.admin_users (
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

create policy "admins read admin list"
  on public.admin_users for select
  to authenticated
  using ((select public.is_admin()));

-- Admins are added by hand (SQL editor) on purpose: no in-app escalation path.

-- ---------------------------------------------------------------------------
-- Events (one per wedding)
-- ---------------------------------------------------------------------------

create table public.events (
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

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;

create policy "admins manage events"
  on public.events for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Guests (one per phone number per event)
-- ---------------------------------------------------------------------------

create table public.guests (
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

create index guests_event_id_idx on public.guests (event_id);

alter table public.guests enable row level security;

create policy "admins manage guests"
  on public.guests for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

create table public.photos (
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

create index photos_event_id_idx on public.photos (event_id);
create index photos_guest_id_idx on public.photos (guest_id);

alter table public.photos enable row level security;

create policy "admins manage photos"
  on public.photos for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Orders (one delivery address = one order)
-- ---------------------------------------------------------------------------

create table public.orders (
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

create index orders_event_id_idx on public.orders (event_id);
create index orders_guest_id_idx on public.orders (guest_id);
create index orders_status_idx on public.orders (status);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

create policy "admins manage orders"
  on public.orders for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  photo_id          uuid not null references public.photos (id) on delete restrict,
  copies            integer not null check (copies between 1 and 50),
  -- Price snapshot at order time, so later price edits don't change bills.
  unit_price_paise  integer not null check (unit_price_paise >= 0),
  unique (order_id, photo_id)
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_photo_id_idx on public.order_items (photo_id);

alter table public.order_items enable row level security;

create policy "admins manage order items"
  on public.order_items for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Couple's statement: everything billed for one event.
-- security_invoker makes the view respect the caller's RLS.
-- ---------------------------------------------------------------------------

create view public.event_statements
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

create policy "admins manage event photos"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'event-photos' and (select public.is_admin()))
  with check (bucket_id = 'event-photos' and (select public.is_admin()));
