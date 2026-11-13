import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Supabase client for Client Components, acting as the signed-in user (RLS
 * applies). Used by the capture screen to upload photos straight to storage.
 */
export function createClient(): SupabaseClient {
  const env = publicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_SCHEMA
      ? { db: { schema: env.NEXT_PUBLIC_SUPABASE_SCHEMA } }
      : undefined,
  ) as unknown as SupabaseClient;
}
