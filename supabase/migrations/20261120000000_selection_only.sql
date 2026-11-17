-- Selection only: a gallery can let the client download just the photos they
-- hearted. Off by default, so existing galleries behave as before.
-- Nothing is removed: unselected photos stay with the studio.

alter table public.projects
  add column selection_only boolean not null default false;
