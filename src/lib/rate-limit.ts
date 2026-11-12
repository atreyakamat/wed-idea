import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Counts one hit for `key` and says whether it's within `limit` per window.
 * If the counter itself fails, it lets the request through: a hiccup in
 * rate limiting must never stop a guest from seeing their photos.
 */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("rate_limit_hit", { p_key: key.slice(0, 200), p_limit: limit, p_window_seconds: windowSeconds });
  if (error) return true;
  return data === true;
}

/** The caller's IP address as the host reports it (Netlify, then standard proxies). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}
