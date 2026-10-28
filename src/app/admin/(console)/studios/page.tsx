import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Filters } from "@/components/admin/filters";
import { StudioStatusBadge } from "@/components/admin/studio-status-badge";
import { formatBytes, formatCount, isStudioStatus } from "@/lib/admin/format";
import { listStudios } from "@/lib/admin/queries";
import { formatIstDate } from "@/lib/events/time";
import { daysLeft, STUDIO_STATUS_LABELS } from "@/lib/studio/status";

export const metadata: Metadata = { title: "Studios" };

const STATUS_OPTIONS = [
  { value: null, label: "All" },
  ...(["trialing", "active", "past_due", "suspended"] as const).map((s) => ({ value: s, label: STUDIO_STATUS_LABELS[s] })),
];

export default function StudiosPage({ searchParams }: PageProps<"/admin/studios">) {
  return (
    <>
      <h1 className="font-display text-4xl italic">Studios</h1>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-line/60" aria-hidden />}>
        <StudioList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function planNote(s: { status: string; trial_ends_at: string; suspended_at: string | null }) {
  if (s.status === "trialing") {
    const days = daysLeft(s.trial_ends_at);
    return days ? `Trial ends in ${days} day${days === 1 ? "" : "s"}` : "Trial ended";
  }
  if (s.status === "suspended" && s.suspended_at) return `Since ${formatIstDate(s.suspended_at)}`;
  return null;
}

async function StudioList({ searchParams }: Readonly<{ searchParams: PageProps<"/admin/studios">["searchParams"] }>) {
  const params = await searchParams;
  const query = (first(params.q) ?? "").trim().slice(0, 100);
  const rawStatus = first(params.status);
  const status = isStudioStatus(rawStatus) ? rawStatus : null;
  const studios = await listStudios({ query, status: status ?? undefined });

  return (
    <div className="mt-8 flex flex-col gap-5">
      <Filters path="/admin/studios" query={query} status={status} options={STATUS_OPTIONS} placeholder="Name, link or owner email" />

      {studios.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">No studios match.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Studio</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Events</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Guests</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Photos</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Storage</th>
                <th scope="col" className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {studios.map((s) => (
                <tr key={s.id} className="hover:bg-line/25">
                  <td className="px-4 py-3">
                    <Link href={`/admin/studios/${s.id}`} className="font-medium hover:text-accent">
                      {s.name}
                    </Link>
                    <p className="text-xs text-muted">{s.owner_email ?? "No owner"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StudioStatusBadge status={s.status} />
                    {planNote(s) ? <p className="mt-1 text-xs text-muted">{planNote(s)}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCount(s.event_count)}
                    {s.live_event_count ? <span className="block text-xs text-success">{s.live_event_count} live</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCount(s.guest_count)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCount(s.photo_count)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBytes(s.storage_bytes)}</td>
                  <td className="px-4 py-3 text-muted">{formatIstDate(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        Showing {studios.length} studio{studios.length === 1 ? "" : "s"}
        {studios.length === 500 ? " (the first 500; narrow the search to see more)" : ""}.
      </p>
    </div>
  );
}
