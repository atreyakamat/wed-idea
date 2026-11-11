import Link from "next/link";
import type { ReactNode } from "react";

export function StatTile({ label, value, note, href }: Readonly<{ label: string; value: ReactNode; note?: ReactNode; href?: string }>) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 font-display text-4xl italic tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </>
  );
  const className = "block rounded-2xl border border-line bg-surface p-5";
  return href ? (
    <Link href={href} className={`${className} transition hover:border-ink`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
