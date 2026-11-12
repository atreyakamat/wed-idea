-- Simple fixed-window rate limits for public and machine endpoints (gallery
-- favourites and pages, the PC app API, password resets). Counted in the
-- database so every server instance shares the same counts. Server code only.

create table public.rate_limit_hits (
  key           text not null check (char_length(key) between 1 and 200),
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limit_hits enable row level security;
-- Only the service role uses this table.
revoke all on public.rate_limit_hits from public, anon, authenticated;

-- Counts one hit and says whether it's within the limit.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limit_hits as r (key, window_start, hits)
  values (p_key, win, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  return n <= p_limit;
end;
$$;

-- Old windows are cleared by the daily clean-up.
create or replace function public.rate_limit_prune()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.rate_limit_hits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from gone;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.rate_limit_prune() from public, anon, authenticated;
