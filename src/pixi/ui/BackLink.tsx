"use client";
import Link from "next/link";

/** Goes back to wherever the person came from (the app or the landing page); falls back to the front door. */
export function BackLink({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Link href="/" prefetch={false} className={className} onClick={(e) => { if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) { e.preventDefault(); history.back(); } }}>
      {children}
    </Link>
  );
}
