-- Team invites: a studio owner or admin makes a private link, sends it (on
-- WhatsApp, usually), and whoever opens it while signed in joins the studio.
--
-- * Only a hash of the link's token is stored. A link works once and for
--   7 days, and can be cancelled before it's used.
-- * Owners can invite admins and operators; admins can invite operators.
-- * Joining still goes through the plan's seat limit (enforce_seat_limit).
-- * Someone who already belongs to a studio can't join a second one (the
--   app shows one studio per person).

create table public.organization_invites (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  role             public.member_role not null check (role in ('admin', 'operator')),
  label            text check (char_length(label) between 1 and 80),
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_at      timestamptz,
  accepted_by      uuid references auth.users (id) on delete set null
);

create index organization_invites_org_idx on public.organization_invites (organization_id, created_at desc);

alter table public.organization_invites enable row level security;

create policy "managers read invites"
  on public.organization_invites for select to authenticated
  using ((select public.is_org_manager(organization_id)));

create policy "managers cancel invites"
  on public.organization_invites for delete to authenticated
  using ((select public.is_org_manager(organization_id)) and accepted_at is null);

-- Makes an invite and returns its token (shown once, in the link).
create or replace function public.create_invite(p_org uuid, p_role public.member_role, p_label text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  my_role public.member_role := public.org_role(p_org);
  seats integer;
  used integer;
  open_invites integer;
begin
  if my_role is null or my_role not in ('owner', 'admin') then
    raise exception 'Only studio owners and admins can invite people.' using errcode = '42501', hint = 'studio_access';
  end if;
  if p_role not in ('admin', 'operator') then
    raise exception 'Invite people as an admin or an operator.' using errcode = '22023', hint = 'project_rule';
  end if;
  if p_role = 'admin' and my_role <> 'owner' then
    raise exception 'Only the studio owner can invite admins.' using errcode = '42501', hint = 'studio_access';
  end if;

  select pl.team_seats into seats from public.organizations o join public.plans pl on pl.id = o.plan_id where o.id = p_org;
  select count(*) into used from public.organization_members where organization_id = p_org;
  select count(*) into open_invites from public.organization_invites
    where organization_id = p_org and accepted_at is null and expires_at > now();
  if used >= seats then
    perform public.raise_plan_limit(format(
      'Every seat on your plan is taken (%s of %s).%s', used, seats, public.upgrade_hint('team_seats', seats, 'seats')
    ));
  end if;
  if open_invites >= 20 then
    raise exception 'Too many open invites. Cancel some first.' using errcode = '22023', hint = 'project_rule';
  end if;

  -- 48 hex characters from two random UUIDs (over 180 random bits).
  token := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48);
  insert into public.organization_invites (organization_id, role, label, token_hash, created_by)
  values (p_org, p_role, nullif(btrim(p_label), ''), encode(sha256(convert_to(token, 'UTF8')), 'hex'), (select auth.uid()));
  return token;
end;
$$;

revoke all on function public.create_invite(uuid, public.member_role, text) from public, anon;
grant execute on function public.create_invite(uuid, public.member_role, text) to authenticated;

-- What an invite link is for, so its page can say "Join <studio> as …"
-- before anyone signs in. Says nothing for a wrong token.
create or replace function public.invite_preview(p_token text)
returns table (studio_name text, role public.member_role, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.role,
         case when i.accepted_at is not null then 'used' when i.expires_at <= now() then 'expired' else 'open' end
  from public.organization_invites i
  join public.organizations o on o.id = i.organization_id
  where p_token ~ '^[0-9a-f]{48}$'
    and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- Joins the studio behind an invite. Returns the studio's id.
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.organization_invites;
begin
  if uid is null then
    raise exception 'Sign in to accept the invite.' using errcode = '42501';
  end if;
  if p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'This invite link isn''t valid.' using errcode = '22023', hint = 'project_rule';
  end if;
  select * into inv from public.organization_invites
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    for update;
  if not found then
    raise exception 'This invite link isn''t valid.' using errcode = '22023', hint = 'project_rule';
  end if;
  if exists (select 1 from public.organization_members where user_id = uid and organization_id = inv.organization_id) then
    return inv.organization_id;
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invite has already been used. Ask for a new one.' using errcode = '22023', hint = 'project_rule';
  end if;
  if inv.expires_at <= now() then
    raise exception 'This invite has expired. Ask for a new one.' using errcode = '22023', hint = 'project_rule';
  end if;
  if exists (select 1 from public.organization_members where user_id = uid) then
    raise exception 'Your account already belongs to a studio. Sign in with another email to join this one.' using errcode = '22023', hint = 'project_rule';
  end if;

  insert into public.organization_members (organization_id, user_id, role) values (inv.organization_id, uid, inv.role);
  update public.organization_invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.organization_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

-- The studio's team with their email addresses (members only).
create or replace function public.studio_team(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org
    and coalesce(public.is_org_member(p_org), false)
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at;
$$;

revoke all on function public.studio_team(uuid) from public, anon;
grant execute on function public.studio_team(uuid) to authenticated;
