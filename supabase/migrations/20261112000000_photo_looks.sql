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

alter table public.project_photos
  add column edited_path        text unique,
  add column edited_thumb_path  text unique,
  add column lighting           text check (lighting in ('daylight', 'golden', 'indoor', 'stage', 'night')),
  add column look               text check (look ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(look) <= 40),
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

create trigger project_photos_check_edited_paths
  before insert or update of edited_path, edited_thumb_path on public.project_photos
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
