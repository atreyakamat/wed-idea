import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Admin = {
  id: string;
  email: string | null;
};

/**
 * Data Access Layer entry point for admin pages and Server Actions.
 * Validates the session and the admin role on every call; never rely on the
 * proxy redirect alone. Reads cookies, so call it inside a <Suspense>
 * boundary when rendering.
 */
export async function requireAdmin(): Promise<Admin> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/admin/login");
  }

  const { data: row } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", claims.sub)
    .maybeSingle();

  if (!row) {
    // Signed in but not an admin: sign out so they can't loop.
    await supabase.auth.signOut();
    redirect("/admin/login?error=not-admin");
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}
