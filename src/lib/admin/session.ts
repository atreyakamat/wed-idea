import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminMfaRow } from "./mfa";

/**
 * The user's admin_users row, or null for everyone else. Admins are added by
 * hand in SQL; there is no way to become one from the app.
 */
export async function getAdminRow(userId: string): Promise<AdminMfaRow | null> {
  const { data, error } = await createAdminClient()
    .from("admin_users")
    .select("mfa_factor_id, mfa_setup_until")
    .eq("user_id", userId)
    .maybeSingle<AdminMfaRow>();
  if (error) throw new Error("Couldn't check admin access.");
  return data;
}

/**
 * Signed-in platform admin, MFA not yet required. Used by the two-step
 * sign-in page itself. Everyone else gets a plain 404, so the admin area
 * doesn't advertise itself.
 */
export async function requireAdminUser(next = "/admin"): Promise<{ user: SessionUser; row: AdminMfaRow }> {
  const user = await requireUser(next);
  const row = await getAdminRow(user.id);
  if (!row) notFound();
  return { user, row };
}

/**
 * Data Access Layer gate for every admin page and action: a platform admin
 * with a registered authenticator, whose session passed two-step sign-in
 * (aal2). The database checks the same in is_admin(), so a bug here can't
 * leak data on its own.
 */
export async function requireAdmin(next = "/admin"): Promise<SessionUser> {
  const { user, row } = await requireAdminUser(next);
  if (user.aal !== "aal2" || !row.mfa_factor_id) redirect(`/admin/mfa?next=${encodeURIComponent(next)}`);
  return user;
}
