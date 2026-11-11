import type { Metadata } from "next";
import { Suspense } from "react";
import { UsageMeter } from "@/components/dashboard/usage-meter";
import { canManage, requireStudio, type Studio } from "@/lib/auth";
import { formatInr } from "@/lib/domain/money";
import { formatIstDate } from "@/lib/events/time";
import { getBilling, type Billing, type Plan } from "@/lib/studio/billing";
import { PAYMENT_METHOD_LABELS } from "@/lib/studio/payments";
import { daysLeft, PAYMENT_GRACE_DAYS } from "@/lib/studio/status";
import { RequestPlanForm } from "./request-form";

export const metadata: Metadata = { title: "Plan & billing" };

export default function BillingPage() {
  return (
    <>
      <h1 className="font-display text-4xl italic">Plan &amp; billing</h1>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-3xl bg-line/60" aria-hidden />}>
        <BillingContent />
      </Suspense>
    </>
  );
}

const DAY_MS = 86_400_000;

/** One line about where the studio stands: trial days, paid-until, or what's wrong. */
function standing(studio: Studio, billing: Billing): string {
  switch (billing.access) {
    case "suspended":
      return "Suspended. Contact support to reactivate.";
    case "trial_ended":
      return `Trial ended ${formatIstDate(studio.trialEndsAt)}.`;
    case "payment_overdue":
      return "Payment overdue. New events are paused.";
    case "payment_due": {
      const lock = studio.paidUntil ? formatIstDate(new Date(new Date(studio.paidUntil).getTime() + PAYMENT_GRACE_DAYS * DAY_MS).toISOString()) : null;
      return lock ? `Payment due. Settle by ${lock} to keep starting events.` : "Payment due.";
    }
    default: {
      if (studio.status === "trialing") {
        const days = daysLeft(studio.trialEndsAt);
        return `Trial ends ${formatIstDate(studio.trialEndsAt)}, in ${days} day${days === 1 ? "" : "s"}.`;
      }
      return studio.paidUntil ? `Paid until ${formatIstDate(studio.paidUntil)}.` : "Complimentary plan.";
    }
  }
}

function priceLabel(plan: Plan) {
  return plan.is_trial ? "Free for 14 days" : `${formatInr(plan.price_paise)} a month`;
}

const fmt = new Intl.NumberFormat("en-IN");

function features(plan: Plan): string[] {
  return [
    `${plan.events_per_month} event${plan.events_per_month === 1 ? "" : "s"} a month`,
    `Up to ${fmt.format(plan.photos_per_event)} photos per event`,
    `${plan.team_seats} team seat${plan.team_seats === 1 ? "" : "s"}`,
    `Galleries kept up to ${plan.gallery_days} days`,
    plan.remove_branding ? "Your brand only on guest galleries" : "Small Cute Wedding Polaroid credit on galleries",
  ];
}

async function BillingContent() {
  const { studio } = await requireStudio("/dashboard/billing");
  const billing = await getBilling(studio);
  const { plan, usage } = billing;
  const manager = canManage(studio.role);
  const paidPlans = billing.plans.filter((p) => !p.is_trial);

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent">Current plan</p>
            <h2 className="mt-1 font-display text-3xl italic">{plan.name}</h2>
          </div>
          <p className="text-sm text-muted">{priceLabel(plan)}</p>
        </div>
        <p className="mt-2 text-sm">{standing(studio, billing)}</p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <UsageMeter label={`Events in ${usage.monthLabel}`} used={usage.eventsThisMonth} limit={plan.events_per_month} unit="events" />
          <UsageMeter label="Team seats" used={usage.members} limit={plan.team_seats} unit="seats" />
        </div>
        <p className="mt-4 text-xs text-muted">
          Events count toward the month they take place in. Up to {fmt.format(plan.photos_per_event)} photos per event, galleries kept up to{" "}
          {plan.gallery_days} days.
        </p>
      </section>

      <section aria-labelledby="plans-heading">
        <h2 id="plans-heading" className="font-display text-2xl italic">
          Plans
        </h2>
        {billing.openRequest ? (
          <p className="mt-2 text-sm text-muted">
            You asked for {billing.plans.find((p) => p.id === billing.openRequest?.plan_id)?.name} on {formatIstDate(billing.openRequest.created_at)}. We&apos;ll be
            in touch to set up payment.
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {paidPlans.map((p) => {
            const current = p.id === plan.id;
            return (
              <article key={p.id} className={`flex flex-col rounded-3xl border bg-surface p-6 ${current ? "border-ink" : "border-line"}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {current ? <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-paper">Your plan</span> : null}
                </div>
                <p className="mt-1 font-display text-3xl italic">
                  {formatInr(p.price_paise)}
                  <span className="font-sans text-sm not-italic text-muted"> / month</span>
                </p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {features(p).map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="text-success">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {manager && !current ? (
                    <RequestPlanForm planId={p.id} planName={p.name} requested={billing.openRequest?.plan_id === p.id} />
                  ) : null}
                  {!manager && !current ? <p className="text-xs text-muted">Ask your studio owner to change the plan.</p> : null}
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">Pay by UPI or bank transfer for now. We confirm your payment and switch your plan, usually the same day.</p>
      </section>

      {manager ? (
        <section className="rounded-3xl border border-line bg-surface">
          <h2 className="border-b border-line px-6 py-4 font-semibold">Payments</h2>
          {billing.payments.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted">No payments yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {billing.payments.map((pay) => (
                <li key={pay.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
                  <span>
                    <span className="font-medium">{formatInr(pay.amount_paise)}</span>
                    <span className="text-muted">
                      {" "}
                      · {billing.plans.find((p) => p.id === pay.plan_id)?.name ?? pay.plan_id} · {PAYMENT_METHOD_LABELS[pay.method]}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {formatIstDate(pay.period_start)} to {formatIstDate(pay.period_end)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
