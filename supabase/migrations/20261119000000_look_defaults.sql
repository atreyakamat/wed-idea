-- The default look a studio chooses for each kind of light.
--
-- A look picked here wins over the look learnt from Review (studio_style).
-- Members can read it (the browser and the PC app use it when editing);
-- only owners and admins can change it.

create table public.studio_look_defaults (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  lighting         text not null check (lighting in ('daylight', 'golden', 'indoor', 'stage', 'night')),
  look             text not null check (look ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(look) <= 40),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null,
  primary key (organization_id, lighting)
);

alter table public.studio_look_defaults enable row level security;

create policy "members read look defaults"
  on public.studio_look_defaults for select to authenticated
  using ((select public.is_org_member(organization_id)));

create policy "managers set look defaults"
  on public.studio_look_defaults for insert to authenticated
  with check ((select public.is_org_manager(organization_id)));

create policy "managers change look defaults"
  on public.studio_look_defaults for update to authenticated
  using ((select public.is_org_manager(organization_id)))
  with check ((select public.is_org_manager(organization_id)));

create policy "managers remove look defaults"
  on public.studio_look_defaults for delete to authenticated
  using ((select public.is_org_manager(organization_id)));

grant select, insert, update, delete on public.studio_look_defaults to authenticated;
