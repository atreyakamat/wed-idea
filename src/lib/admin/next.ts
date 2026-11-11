import { safeAppRedirect } from "@/lib/safe-redirect";

/** Where to go after two-step sign-in: an admin page, never back to /admin/mfa. */
export function adminNext(next: unknown): string {
  const target = safeAppRedirect(next, "/admin");
  const isAdminPage = target === "/admin" || target.startsWith("/admin/") || target.startsWith("/admin?");
  if (!isAdminPage || target === "/admin/mfa" || target.startsWith("/admin/mfa?") || target.startsWith("/admin/mfa/")) return "/admin";
  return target;
}

/** "123 456" or "123456" -> "123456"; anything else -> null. */
export function parseTotpCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
