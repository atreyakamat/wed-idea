-- Missed-shot checks. The review screen measures each photo in the browser
-- (sharpness, exposure, a fingerprint for near-identical frames, and how
-- many faces have closed eyes) and saves the numbers here, so they're done
-- once. Which photos count as misses is worked out from these across the
-- whole project, in the app. Written by server code only.

alter table public.project_photos
  add column quality jsonb check (quality is null or jsonb_typeof(quality) = 'object'),
  add column checked_at timestamptz;

create index project_photos_unchecked_idx on public.project_photos (project_id) where checked_at is null;
