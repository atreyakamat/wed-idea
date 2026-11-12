-- Self-serve payment with Razorpay.
--
-- A studio owner or admin picks a plan and how many months, the server makes
-- a Razorpay order (razorpay_orders), and Razorpay Checkout takes the payment
-- (UPI, cards, net banking). The payment is applied once, whichever arrives
-- first: the browser's confirmation (signature checked by the server) or
-- Razorpay's webhook. Applying works like a payment recorded by hand: the
-- studio moves to the plan, becomes active and is paid to the end of the
-- period. Only server code (service role) creates or applies orders.

create table public.razorpay_orders (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,
  plan_id           text not null references public.plans (id),
  months            integer not null check (months between 1 and 24),
  amount_paise      integer not null check (amount_paise > 0),
  order_id          text not null unique check (order_id ~ '^order_[A-Za-z0-9]{6,40}$'),
  status            text not null default 'created' check (status in ('created', 'paid')),
  payment_id        text unique check (payment_id ~ '^pay_[A-Za-z0-9]{6,40}$'),
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz
);

create index razorpay_orders_org_idx on public.razorpay_orders (organization_id, created_at desc);

alter table public.razorpay_orders enable row level security;

create policy "managers read their orders"
  on public.razorpay_orders for select to authenticated
  using ((select public.is_org_manager(organization_id)));

-- Applies a paid order. Safe to call twice (the second call changes nothing).
-- Returns the studio's new paid-until.
create or replace function public.apply_razorpay_payment(p_order text, p_payment text, p_amount_paise integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.razorpay_orders;
  org public.organizations;
  starts timestamptz;
  ends timestamptz;
begin
  select * into o from public.razorpay_orders where order_id = p_order for update;
  if not found then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;
  if o.status = 'paid' then
    if o.payment_id <> p_payment then
      raise exception 'This order was already paid by another payment' using errcode = '22023';
    end if;
    select paid_until into ends from public.organizations where id = o.organization_id;
    return ends;
  end if;
  if p_amount_paise is distinct from o.amount_paise then
    raise exception 'Paid amount doesn''t match the order' using errcode = '22023';
  end if;

  select * into org from public.organizations where id = o.organization_id for update;
  starts := case
    when org.plan_id = o.plan_id then greatest(coalesce(org.paid_until, now()), now())
    else now()
  end;
  ends := starts + make_interval(months => o.months);

  insert into public.payments (organization_id, plan_id, amount_paise, method, reference, months, period_start, period_end, recorded_by)
  values (o.organization_id, o.plan_id, o.amount_paise, 'razorpay', p_payment, o.months, starts, ends, o.created_by);

  update public.organizations
  set plan_id = o.plan_id,
      paid_until = ends,
      status = case when status = 'suspended' then status else 'active' end
  where id = o.organization_id;

  update public.plan_requests
  set status = 'done', resolved_at = now()
  where organization_id = o.organization_id and status = 'open';

  update public.razorpay_orders set status = 'paid', payment_id = p_payment, paid_at = now() where id = o.id;

  perform public.write_audit(
    'studio.payment_recorded',
    o.organization_id,
    jsonb_build_object('plan', o.plan_id, 'amount_paise', o.amount_paise, 'method', 'razorpay', 'reference', p_payment, 'months', o.months, 'until', ends)
  );
  return ends;
end;
$$;

revoke all on function public.apply_razorpay_payment(text, text, integer) from public, anon, authenticated;
