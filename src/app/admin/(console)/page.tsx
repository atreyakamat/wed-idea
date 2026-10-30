import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignupsChart } from "@/components/admin/signups-chart";
import { StatTile } from "@/components/admin/stat-tile";
import { StudioStatusBadge } from "@/components/admin/studio-status-badge";
import { auditSubject, describeAudit, formatBytes, formatCount } from "@/lib/admin/format";
import { getOverview, listAudit, listPlanRequests, listStudios, type PlanRequest } from "@/lib/admin/queries";
import { formatInr } from "@/lib/domain/money";
import { formatIstDate } from "@/lib/events/time";
import { dismissRequest } from "./actions";

export const metadata: Metadata = { title: "Overview" };

export default function AdminOverviewPage() {
  return (
    <>
      <h1 className="font-display text-4xl italic">Overview</h1>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-line/60" aria-hidden />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const [o, studios, audit, requests] = await Promise.all([getOverview(), listStudios(), listAudit({ limit: 6 }), listPlanRequests()]);
  const needsAttention = o.studios.past_due + o.studios.suspended + o.studios.trials_ended;

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section aria-label="Studios" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Studios" value={formatCount(o.studios.total)} note={`${o.studios.new_30d} new in 30 days`} href="/admin/studios" />
        <StatTile label="Paying" value={formatCount(o.studios.active)} href="/admin/studios?status=active" />
        <StatTile
          label="On trial"
          value={formatCount(o.studios.trialing)}
          note={o.studios.trials_ending_7d ? `${o.studios.trials_ending_7d} ending this week` : "None ending this week"}
          href="/admin/studios?status=trialing"
        />
        <StatTile
          label="Need attention"
          value={formatCount(needsAttention)}
          note={`${o.studios.past_due} payment due · ${o.studios.trials_ended} trial ended · ${o.studios.suspended} suspended`}
          href="/admin/studios?status=attention"
        />
      </section>

      <section aria-label="Revenue" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Monthly revenue" value={formatInr(Number(o.revenue.mrr_paise))} note="Paid plans, at list price" />
        <StatTile label="Received" value={formatInr(Number(o.revenue.received_30d_paise))} note="Last 30 days" />
        <StatTile label="Upgrade requests" value={formatCount(o.open_requests)} note={o.open_requests ? "Waiting for you below" : "None waiting"} />
        <StatTile label="Trials ended" value={formatCount(o.studios.trials_ended)} note="Not yet on a plan" href="/admin/studios?status=attention" />
      </section>

      {requests.length ? <UpgradeRequests requests={requests} /> : null}

      <section aria-label="Usage" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Live now" value={formatCount(o.events.live)} note={`${formatCount(o.events.total)} events in total`} href="/admin/events?status=live" />
        <StatTile label="Guests" value={formatCount(o.guests)} />
        <StatTile label="Photos" value={formatCount(o.photos)} />
        <StatTile label="Storage" value={formatBytes(o.storage_bytes)} note="Photo files in the bucket" />
      </section>

      <SignupsChart weeks={o.signups_by_week} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Newest studios</h2>
            <Link href="/admin/studios" className="text-sm text-muted hover:text-ink">
              All studios →
            </Link>
          </div>
          {studios.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No studios yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {studios.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/studios/${s.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {s.owner_email ?? "No owner"} · joined {formatIstDate(s.created_at)}
                      </span>
                    </span>
                    <StudioStatusBadge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Recent admin activity</h2>
            <Link href="/admin/audit" className="text-sm text-muted hover:text-ink">
              Audit log →
            </Link>
          </div>
          {audit.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing yet. Status changes and trial extensions show up here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {audit.map((a) => (
                <li key={a.id} className="py-2.5 text-sm">
                  <p>
                    <span className="font-medium">{auditSubject(a)}</span> · {describeAudit(a.action, a.details)}
                  </p>
                  <p className="text-xs text-muted">
                    {a.actor_email ?? "Unknown admin"} · {formatIstDate(a.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function UpgradeRequests({ requests }: Readonly<{ requests: PlanRequest[] }>) {
  return (
    <section className="rounded-2xl border border-accent/40 bg-surface">
      <h2 className="border-b border-line px-5 py-4 font-semibold">Upgrade requests</h2>
      <ul className="divide-y divide-line">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <span className="min-w-0">
              <Link href={`/admin/studios/${r.organization_id}`} className="font-medium hover:text-accent">
                {r.studio_name}
              </Link>
              <span className="text-muted">
                {" "}
                · {r.current_plan} → {r.plan_name}
              </span>
              <span className="block text-xs text-muted">
                {r.requested_by_email ?? "Unknown"} · {formatIstDate(r.created_at)}
                {r.note ? ` · "${r.note}"` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Link
                href={`/admin/studios/${r.organization_id}?plan=${r.plan_id}#payment`}
                className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper hover:opacity-90"
              >
                Record payment
              </Link>
              <form action={dismissRequest.bind(null, r.id)}>
                <button type="submit" className="rounded-full border border-line px-4 py-2 text-xs font-semibold hover:border-ink">
                  Dismiss
                </button>
              </form>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
