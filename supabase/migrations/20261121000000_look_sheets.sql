-- Look sheets: the designs a studio offers its clients for the photos they pick.
-- One or both: 'grid' (the photo in every look) and 'before-after' (original and
-- the chosen look). An empty list turns them off.

alter table public.organizations
  add column look_sheets text[] not null default array['grid']::text[]
  check (look_sheets <@ array['grid', 'before-after']::text[]);
