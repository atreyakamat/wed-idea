import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whether the user is a platform admin (a row in admin_users). Admins are
 * added by hand in SQL; there is no way to become one from the app.
 */
async function isAdminUser(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't check admin access.");
  return Boolean(data);
}

/**
 * Signed-in platform admin, MFA not yet required. Used by the two-step
 * sign-in page itself. Everyone else gets a plain 404, so the admin area
 * doesn't advertise itself.
 */
export async function requireAdminUser(next = "/admin"): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!(await isAdminUser(user.id))) notFound();
  return user;
}

/**
 * Data Access Layer gate for every admin page and action: a platform admin
 * whose session passed two-step sign-in (aal2). The database checks the same
 * thing again in is_admin(), so a bug here can't leak data on its own.
 */
export async function requireAdmin(next = "/admin"): Promise<SessionUser> {
  const user = await requireAdminUser(next);
  if (user.aal !== "aal2") redirect(`/admin/mfa?next=${encodeURIComponent(next)}`);
  return user;
}
