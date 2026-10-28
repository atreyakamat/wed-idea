const APP_PREFIXES = ["/dashboard", "/onboarding", "/admin"];

/**
 * Only allows redirects to pages inside the app on this site. Blocks open
 * redirects like "//evil.com" or "https://evil.com" passed in ?next=.
 */
export function safeAppRedirect(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string") return fallback;
  if (next.startsWith("//") || next.includes("\\")) return fallback;
  const allowed = APP_PREFIXES.some((p) => next === p || next.startsWith(`${p}/`) || next.startsWith(`${p}?`));
  return allowed ? next : fallback;
}
