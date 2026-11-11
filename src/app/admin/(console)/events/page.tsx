import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Filters } from "@/components/admin/filters";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { formatCount } from "@/lib/admin/format";
import { listEvents } from "@/lib/admin/queries";
import { STATUS_LABELS, type EventStatus } from "@/lib/events/status";
import { formatIstDate } from "@/lib/events/time";

export const metadata: Metadata = { title: "Events" };

const EVENT_STATUSES = Object.keys(STATUS_LABELS) as EventStatus[];
const isEventStatus = (v: unknown): v is EventStatus => typeof v === "string" && (EVENT_STATUSES as string[]).includes(v);
const STATUS_OPTIONS = [{ value: null, label: "All" }, ...EVENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function AdminEventsPage({ searchParams }: PageProps<"/admin/events">) {
  return (
    <>
      <h1 className="font-display text-4xl italic">Events</h1>
      <p className="mt-1 text-sm text-muted">Every studio&apos;s weddings, read-only, for support.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-line/60" aria-hidden />}>
        <EventList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function EventList({ searchParams }: Readonly<{ searchParams: PageProps<"/admin/events">["searchParams"] }>) {
  const params = await searchParams;
  const query = (first(params.q) ?? "").trim().slice(0, 100);
  const rawStatus = first(params.status);
  const status = isEventStatus(rawStatus) ? rawStatus : null;
  const events = await listEvents({ query, status: status ?? undefined });

  return (
    <div className="mt-8 flex flex-col gap-5">
      <Filters path="/admin/events" query={query} status={status} options={STATUS_OPTIONS} placeholder="Couple or studio name" />
      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">No events match.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Couple</th>
                <th scope="col" className="px-4 py-3 font-medium">Studio</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Guests</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Photos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{e.couple_names}</span>
                    {e.venue ? <span className="block text-xs text-muted">{e.venue}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/studios/${e.organization_id}`} className="hover:text-accent">
                      {e.studio_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="px-4 py-3 text-muted">{formatIstDate(e.starts_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCount(e.guest_count)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCount(e.photo_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
