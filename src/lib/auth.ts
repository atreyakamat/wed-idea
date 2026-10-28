import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type MemberRole = "owner" | "admin" | "operator";

export type StudioStatus = "trialing" | "active" | "past_due" | "suspended";

export type SessionUser = { id: string; email: string | null; aal: "aal1" | "aal2" };

export type Studio = {
  id: string;
  name: string;
  slug: string;
  role: MemberRole;
  status: StudioStatus;
  trialEndsAt: string;
  suspendedReason: string | null;
};

/**
 * Data Access Layer entry point. Validates the session on every call (the
 * proxy redirect is only a first gate) and returns the signed-in user, or
 * sends them to the login page. Reads cookies, so render callers inside a
 * <Suspense> boundary.
 */
export async function requireUser(next?: string): Promise<SessionUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
  };
}

/** The user's studios, oldest membership first. RLS limits rows to their own. */
export async function listStudios(userId: string): Promise<Studio[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, created_at, organizations (id, name, slug, status, trial_ends_at, suspended_reason)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Couldn't load your studios: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (!org) return [];
    return [
      {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: row.role as MemberRole,
        status: org.status as StudioStatus,
        trialEndsAt: org.trial_ends_at,
        suspendedReason: org.suspended_reason,
      },
    ];
  });
}

/**
 * Signed-in user plus their studio. Users without a studio go to onboarding.
 * One studio per user for now; a studio switcher can come later.
 */
export async function requireStudio(next?: string): Promise<{ user: SessionUser; studio: Studio }> {
  const user = await requireUser(next);
  const [studio] = await listStudios(user.id);
  if (!studio) redirect("/onboarding");
  return { user, studio };
}

export function canManage(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

/** For Server Actions: like requireStudio, but also insists on a manager role. */
export async function requireStudioManager() {
  const session = await requireStudio();
  if (!canManage(session.studio.role)) {
    throw new Error("Only studio owners and admins can change this.");
  }
  return session;
}
