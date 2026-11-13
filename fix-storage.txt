-- ============================================================================
-- FIX STORAGE BUCKETS & ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Run this in your Supabase Dashboard -> SQL Editor -> New query -> Run.
-- This ensures the 3 storage buckets exist and grants proper upload/read permissions.

-- 1. Ensure storage buckets exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('event-photos', 'event-photos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp']),
  ('project-photos', 'project-photos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp']),
  ('studio-assets', 'studio-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Grant permissions on helper functions
grant execute on function public.storage_path_org(text) to authenticated, anon;
grant execute on function public.is_org_member(uuid) to authenticated, anon;
grant execute on function public.is_org_manager(uuid) to authenticated, anon;
grant execute on function public.capture_open(uuid) to authenticated, anon;
grant execute on function public.can_upload_photo(text) to authenticated;
grant execute on function public.can_upload_project_photo(text) to authenticated;

-- 3. Drop all previous/conflicting storage policies cleanly
drop policy if exists "admins manage event photos" on storage.objects;
drop policy if exists "members manage their studio's photos" on storage.objects;
drop policy if exists "members read their studio's photos" on storage.objects;
drop policy if exists "members delete their studio's photos" on storage.objects;
drop policy if exists "active members upload photos" on storage.objects;
drop policy if exists "active members replace photos" on storage.objects;
drop policy if exists "members read project files" on storage.objects;
drop policy if exists "members upload project files" on storage.objects;
drop policy if exists "managers delete project files" on storage.objects;
drop policy if exists "anyone read studio assets" on storage.objects;
drop policy if exists "managers upload studio assets" on storage.objects;
drop policy if exists "managers delete studio assets" on storage.objects;

-- 4. BUCKET: event-photos (Capture station at events)
create policy "members read their studio's photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
  );

create policy "active members upload photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and (select public.can_upload_photo(name))
  );

create policy "active members replace photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
  )
  with check (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
    and (select public.can_upload_photo(name))
  );

create policy "members delete their studio's photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
  );

-- 5. BUCKET: project-photos (Photo delivery & review)
create policy "members read project files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-photos'
    and (select public.is_org_member(public.storage_path_org(name)))
  );

create policy "members upload project files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-photos'
    and (select public.can_upload_project_photo(name))
  );

create policy "managers delete project files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-photos'
    and (select public.is_org_manager(public.storage_path_org(name)))
  );

-- 6. BUCKET: studio-assets (Studio logos - public viewable)
create policy "anyone read studio assets"
  on storage.objects for select
  using (bucket_id = 'studio-assets');

create policy "managers upload studio assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'studio-assets'
    and name ~ '^[0-9a-f-]{36}/logo-[0-9a-f]{8,32}\.(png|jpg|webp)$'
    and (select public.is_org_manager(public.storage_path_org(name)))
  );

create policy "managers delete studio assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'studio-assets'
    and (select public.is_org_manager(public.storage_path_org(name)))
  );
