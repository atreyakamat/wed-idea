"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Polaroid events", match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/events") },
  { href: "/dashboard/projects", label: "Photo delivery", match: (p: string) => p.startsWith("/dashboard/projects") || p.startsWith("/dashboard/computers") },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const active = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${active ? "bg-ink text-paper" : "text-muted hover:bg-line/60 hover:text-ink"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
