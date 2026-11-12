"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

/** Public marketing pages only. Galleries, dashboards and sign-in never load it. */
export const TRACKED_PATHS = ["/", "/pricing", "/templates", "/terms", "/privacy", "/signup"];

export function isTracked(pathname: string): boolean {
  return TRACKED_PATHS.includes(pathname);
}

/**
 * Cookie-free page counts (Plausible or a compatible service). Off unless
 * NEXT_PUBLIC_ANALYTICS_DOMAIN is set.
 */
export function Analytics() {
  const pathname = usePathname();
  const domain = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN;
  const src = process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT || "https://plausible.io/js/script.js";
  if (!domain || !isTracked(pathname)) return null;
  return <Script src={src} data-domain={domain} strategy="afterInteractive" />;
}
