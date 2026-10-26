-- Capture and guest gallery.
--
-- * guests.link_sent_at: when the operator sent the guest their gallery link.
-- * photos.thumb_path: a small copy for fast galleries; storage_path stays
--   the full-size photo used for downloads and prints.
-- * photos.created_by: which team member captured it.
-- * The photo bucket only accepts images up to 15 MB.

alter table public.guests
  add column link_sent_at timestamptz;

alter table public.photos
  add column thumb_path text unique,
  add column created_by uuid references auth.users (id) on delete set null;

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

create trigger photos_paths_match_event
  before insert or update of storage_path, thumb_path, event_id on public.photos
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

create trigger photos_guest_matches_event
  before insert or update of guest_id, event_id on public.photos
  for each row execute function public.photo_guest_matches_event();

update storage.buckets
set file_size_limit = 15 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'event-photos';
