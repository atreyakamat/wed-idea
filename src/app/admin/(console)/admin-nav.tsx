"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/studios", label: "Studios" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

/** Highlights the current section. Reads the URL, so render inside <Suspense>. */
export function AdminNav() {
  return <NavLinks pathname={usePathname()} />;
}

/** The same links with nothing highlighted, shown while the URL streams in. */
export function NavLinks({ pathname }: Readonly<{ pathname: string | null }>) {
  return (
    <nav aria-label="Admin" className="-mb-px flex gap-1 overflow-x-auto">
      {LINKS.map(({ href, label }) => {
        const active = href === "/admin" ? pathname === href : pathname === href || Boolean(pathname?.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
              active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
