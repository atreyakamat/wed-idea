-- Photo review and the studio's learnt style.
--
-- * A photographer can swap a photo's look in the browser. The new edit is
--   saved as a new pair of files, "<photo>.edit.<version>.jpg" and
--   "<photo>.edit.<version>.thumb.jpg", so no cached copy of the old edit is
--   ever shown. The old pair is removed by the server once the row points at
--   the new one (and by the daily clean-up if that step is missed).
-- * project_photos.reviewed_at marks photos the photographer has approved.
-- * studio_look_picks counts which look the studio picks for each kind of
--   light. Once one look clearly wins (3+ picks and 40%+ of that light's
--   picks), new photos in that light get it by default, in the browser and
--   in the PC app.
--
-- Row changes for both go through server code (service role) after it checks
-- the user is a member of the studio; members can still only change
-- "hidden" directly.

alter table public.project_photos add column reviewed_at timestamptz;

create index project_photos_review_idx on public.project_photos (project_id) where reviewed_at is null;

-- Versioned edit files may be uploaded too.
create or replace function public.can_upload_project_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_path ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.edit(\.[a-z0-9]{8})?)?(\.thumb)?\.jpg$' then
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

-- The studio's picks -------------------------------------------------------

create table public.studio_look_picks (
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  lighting         text not null check (lighting in ('daylight', 'golden', 'indoor', 'stage', 'night')),
  look             text not null check (look ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(look) <= 40),
  picks            integer not null default 0 check (picks >= 0),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, lighting, look)
);

alter table public.studio_look_picks enable row level security;

create policy "members read look picks"
  on public.studio_look_picks for select to authenticated
  using ((select public.is_org_member(organization_id)));

-- "Forget my style" on the Studio page.
create policy "managers reset look picks"
  on public.studio_look_picks for delete to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Adds picks. Server code only (it checks membership first).
create or replace function public.record_look_picks(p_org uuid, p_lighting text, p_look text, p_count integer default 1)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.studio_look_picks as s (organization_id, lighting, look, picks)
  values (p_org, p_lighting, p_look, greatest(1, least(p_count, 1000)))
  on conflict (organization_id, lighting, look)
  do update set picks = s.picks + excluded.picks, updated_at = now();
$$;

revoke all on function public.record_look_picks(uuid, text, text, integer) from public, anon, authenticated;

-- The look a studio has settled on for each kind of light.
create or replace function public.studio_style(p_org uuid)
returns table (lighting text, look text, picks integer)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select s.lighting, sum(s.picks) as total from public.studio_look_picks s where s.organization_id = p_org group by s.lighting
  ),
  ranked as (
    select s.lighting, s.look, s.picks, t.total,
           row_number() over (partition by s.lighting order by s.picks desc, s.updated_at desc) as rank
    from public.studio_look_picks s
    join totals t on t.lighting = s.lighting
    where s.organization_id = p_org
  )
  select r.lighting, r.look, r.picks
  from ranked r
  where r.rank = 1 and r.picks >= 3 and r.picks >= 0.4 * r.total
    and ((select auth.role()) = 'service_role' or coalesce(public.is_org_member(p_org), false));
$$;

revoke all on function public.studio_style(uuid) from public, anon;
grant execute on function public.studio_style(uuid) to authenticated;
