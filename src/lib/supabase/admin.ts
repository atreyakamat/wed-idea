import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Service-role client that bypasses RLS. Use only on the server, and only
 * after checking authorization yourself (for example, validating a guest's
 * access token before reading their photos).
 */
export function createAdminClient() {
  return createClient(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
