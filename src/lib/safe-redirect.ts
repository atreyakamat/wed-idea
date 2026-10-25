/**
 * Only allows redirects to admin pages on this site. Blocks open redirects
 * like "//evil.com" or "https://evil.com" passed in the ?next= parameter.
 */
export function safeAdminRedirect(next: unknown, fallback = "/admin"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/admin")) return fallback;
  if (next.startsWith("//") || next.includes("\\")) return fallback;
  if (next.startsWith("/admin/login")) return fallback;
  return next;
}
