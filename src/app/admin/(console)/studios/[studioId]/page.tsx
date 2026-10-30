import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { StatTile } from "@/components/admin/stat-tile";
import { AccessBadge } from "@/components/admin/access-badge";
import { StudioStatusBadge } from "@/components/admin/studio-status-badge";
import { describeAudit, formatBytes, formatCount } from "@/lib/admin/format";
import { getStudio, listAllPlans, listAudit, listEvents, listMembers, listPayments, type AdminStudio } from "@/lib/admin/queries";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { formatIstDate, formatIstDateTime } from "@/lib/events/time";
import { formatInr } from "@/lib/domain/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/studio/payments";
import { daysLeft } from "@/lib/studio/status";
import { ChangePlanForm, PaymentForm } from "./billing-forms";
import { StatusForm, TrialForm } from "./studio-actions";

export const metadata: Metadata = { title: "Studio" };

/** Where the studio stands on its plan, in one line. */
function planStanding(studio: AdminStudio): string {
  if (studio.status === "trialing") return `Trial until ${formatIstDate(studio.trial_ends_at)}`;
  if (studio.paid_until) return `${studio.access === "ok" ? "Paid" : "Was paid"} until ${formatIstDate(studio.paid_until)}`;
  return "Complimentary, no end date";
}

export default function AdminStudioPage({ params, searchParams }: PageProps<"/admin/studios/[studioId]">) {
  return (
    <>
      <Link href="/admin/studios" className="text-sm text-muted hover:text-ink">
        ← Studios
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-line/60" aria-hidden />}>
        <StudioDetail params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function StudioDetail({
  params,
  searchParams,
}: Readonly<{ params: PageProps<"/admin/studios/[studioId]">["params"]; searchParams: PageProps<"/admin/studios/[studioId]">["searchParams"] }>) {
  const { studioId } = await params;
  const requestedPlan = (await searchParams).plan;
  if (!UUID_PATTERN.test(studioId)) notFound();
  const studio = await getStudio(studioId);
  if (!studio) notFound();
  const [members, events, audit, plans, payments] = await Promise.all([
    listMembers(studio.id),
    listEvents({ studioId: studio.id }),
    listAudit({ studioId: studio.id, limit: 50 }),
    listAllPlans(),
    listPayments({ studioId: studio.id }),
  ]);
  const trialDays = daysLeft(studio.trial_ends_at);

  return (
    <div className="mt-2 flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl italic">{studio.name}</h1>
        <StudioStatusBadge status={studio.status} />
        <AccessBadge access={studio.access} />
        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium">{studio.plan_name}</span>
        <p className="w-full text-sm text-muted">
          /{studio.slug} · owner {studio.owner_email ?? "none"} · joined {formatIstDate(studio.created_at)}
        </p>
      </header>

      {studio.status === "suspended" ? (
        <p role="status" className="rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4 text-sm">
          <span className="font-semibold">Suspended {studio.suspended_at ? formatIstDate(studio.suspended_at) : ""}.</span>{" "}
          {studio.suspended_reason}
        </p>
      ) : null}

      <section aria-label="Usage" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Events" value={formatCount(studio.event_count)} note={`${studio.live_event_count} live`} />
        <StatTile label="Guests" value={formatCount(studio.guest_count)} />
        <StatTile label="Photos" value={formatCount(studio.photo_count)} />
        <StatTile label="Storage" value={formatBytes(studio.storage_bytes)} />
        <StatTile label="Team" value={formatCount(studio.member_count)} note={studio.member_count === 1 ? "member" : "members"} />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-8">
          <section className="rounded-2xl border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-4 font-semibold">Events</h2>
            {events.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No events yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">{e.couple_names}</span>
                      <span className="block text-xs text-muted">
                        {formatIstDate(e.starts_at)}
                        {e.venue ? ` · ${e.venue}` : ""} · {formatCount(e.guest_count)} guests · {formatCount(e.photo_count)} photos
                      </span>
                    </span>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-4 font-semibold">Payments</h2>
            {payments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No payments recorded.</p>
            ) : (
              <ul className="divide-y divide-line">
                {payments.map((pay) => (
                  <li key={pay.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {formatInr(pay.amount_paise)} · {pay.plan_name} · {pay.months} month{pay.months === 1 ? "" : "s"}
                      </span>
                      <span className="block text-xs text-muted">
                        {PAYMENT_METHOD_LABELS[pay.method]}
                        {pay.reference ? ` ${pay.reference}` : ""} · recorded by {pay.recorded_by_email ?? "unknown"} on {formatIstDate(pay.created_at)}
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

          <section className="rounded-2xl border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-4 font-semibold">Team</h2>
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="truncate">{m.email ?? m.user_id}</span>
                  <span className="text-xs capitalize text-muted">{m.role}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-4 font-semibold">History</h2>
            {audit.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No admin changes yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {audit.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <p>{describeAudit(a.action, a.details)}</p>
                    <p className="text-xs text-muted">
                      {a.actor_email ?? "Unknown admin"} · {formatIstDateTime(a.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-2xl border border-line bg-surface p-5" aria-labelledby="plan-heading">
            <h2 id="plan-heading" className="font-semibold">
              Plan &amp; payment
            </h2>
            <p className="mt-1 text-sm text-muted">
              {studio.plan_name} · {planStanding(studio)}
            </p>
            <div className="mt-4 flex flex-col gap-6">
              <PaymentForm studioId={studio.id} plans={plans} initialPlan={typeof requestedPlan === "string" ? requestedPlan : studio.plan_id} />
              <div className="border-t border-line pt-5">
                <ChangePlanForm studioId={studio.id} plans={plans} current={studio.plan_id} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">Change status</h2>
            <p className="mt-1 text-xs text-muted">Every change is recorded in the audit log with your email.</p>
            <div className="mt-4">
              <StatusForm studioId={studio.id} current={studio.status} />
            </div>
          </section>

          {studio.status === "trialing" ? (
            <section className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-semibold">Trial</h2>
              <p className="mt-1 text-sm text-muted">
                {trialDays ? `Ends ${formatIstDate(studio.trial_ends_at)}, in ${trialDays} day${trialDays === 1 ? "" : "s"}.` : `Ended ${formatIstDate(studio.trial_ends_at)}. Extending restarts it from today.`}
              </p>
              <div className="mt-4">
                <TrialForm studioId={studio.id} />
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
