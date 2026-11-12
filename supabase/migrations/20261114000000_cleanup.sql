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
