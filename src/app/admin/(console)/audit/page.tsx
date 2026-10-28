import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { describeAudit } from "@/lib/admin/format";
import { listAudit } from "@/lib/admin/queries";
import { formatIstDateTime } from "@/lib/events/time";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <>
      <h1 className="font-display text-4xl italic">Audit log</h1>
      <p className="mt-1 text-sm text-muted">Every admin change, newest first. Entries can&apos;t be edited or deleted.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-line/60" aria-hidden />}>
        <AuditList />
      </Suspense>
    </>
  );
}

async function AuditList() {
  const entries = await listAudit({ limit: 500 });
  if (entries.length === 0) {
    return <p className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">No admin changes yet.</p>;
  }
  return (
    <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">When</th>
            <th scope="col" className="px-4 py-3 font-medium">Studio</th>
            <th scope="col" className="px-4 py-3 font-medium">Change</th>
            <th scope="col" className="px-4 py-3 font-medium">Admin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {entries.map((a) => (
            <tr key={a.id} className="align-top">
              <td className="whitespace-nowrap px-4 py-3 text-muted">{formatIstDateTime(a.created_at)}</td>
              <td className="px-4 py-3">
                {a.organization_id && a.studio_name ? (
                  <Link href={`/admin/studios/${a.organization_id}`} className="font-medium hover:text-accent">
                    {a.studio_name}
                  </Link>
                ) : (
                  <span className="text-muted">Deleted studio</span>
                )}
              </td>
              <td className="px-4 py-3">{describeAudit(a.action, a.details)}</td>
              <td className="px-4 py-3 text-muted">{a.actor_email ?? "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
