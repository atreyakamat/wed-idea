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
  add column tone text check (tone ~ '^#[0-9a-f]{6}$');

create table public.project_photo_hearts (
  photo_id    uuid not null references public.project_photos (id) on delete cascade,
  visitor     uuid not null,
  created_at  timestamptz not null default now(),
  primary key (photo_id, visitor)
);

create index project_photo_hearts_visitor_idx on public.project_photo_hearts (visitor);

alter table public.project_photo_hearts enable row level security;

-- Studios read the hearts on their own photos. Nobody writes through the API
-- directly: the gallery's server code does, after checking the link.
create policy "members read hearts on their photos"
  on public.project_photo_hearts for select to authenticated
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
  add column logo_path text check (logo_path ~ '^[0-9a-f-]{36}/logo-[0-9a-f]{8,32}\.(png|jpg|webp)$');

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

create trigger organizations_check_logo
  before insert or update of logo_path on public.organizations
  for each row execute function public.check_studio_logo();

-- Public bucket: logos appear on public galleries. Images only, 2 MB max; no
-- SVG (it can carry scripts).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('studio-assets', 'studio-assets', true, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "managers upload studio assets"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'studio-assets'
    and name ~ '^[0-9a-f-]{36}/logo-[0-9a-f]{8,32}\.(png|jpg|webp)$'
    and (select public.is_org_manager(public.storage_path_org(name)))
  );

create policy "managers delete studio assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'studio-assets' and (select public.is_org_manager(public.storage_path_org(name))));
