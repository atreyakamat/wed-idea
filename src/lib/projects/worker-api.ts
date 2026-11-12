import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { StudioStatus } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { accessFor, blockedMessage } from "@/lib/studio/status";
import { allow } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerToken, hashWorkerToken } from "./worker-token";

// The PC app's API. Every call carries "Authorization: Bearer cwp_wk_…".
// Calls run with the service role, scoped by hand to the token's studio; the
// database still applies plan limits and access rules to every write.

export type WorkerStudio = {
  id: string;
  name: string;
  status: StudioStatus;
  trialEndsAt: string;
  paidUntil: string | null;
  planId: string;
};

export type WorkerSession = { supabase: SupabaseClient; tokenId: string; computer: string; studio: WorkerStudio };

type TokenRow = {
  id: string;
  name: string;
  last_used_at: string | null;
  organizations: { id: string; name: string; status: StudioStatus; trial_ends_at: string; paid_until: string | null; plan_id: string } | null;
};

/** How often "last seen" is written, so a busy upload doesn't write on every call. */
const LAST_SEEN_EVERY_MS = 5 * 60 * 1000;

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The studio a request's worker token belongs to, or a 401 response. */
export async function authenticateWorker(request: Request): Promise<WorkerSession | NextResponse> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return jsonError(401, "Missing or malformed token. Run `cwp-worker login` again.");

  const hash = hashWorkerToken(token);
  // ~20 calls a second per computer is far above any real upload pace.
  if (!(await allow(`worker:${hash.slice(0, 32)}`, 1200, 60))) return jsonError(429, "Too many requests. Slow down and try again in a minute.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("worker_tokens")
    .select("id, name, last_used_at, organizations (id, name, status, trial_ends_at, paid_until, plan_id)")
    .eq("token_hash", hash)
    .is("revoked_at", null)
    .maybeSingle<TokenRow>();
  if (error) return jsonError(500, "Couldn't check the token. Try again.");
  const org = data?.organizations;
  if (!data || !org) return jsonError(401, "This computer has been disconnected. Connect it again from the dashboard.");

  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > LAST_SEEN_EVERY_MS) {
    await supabase.from("worker_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }

  return {
    supabase,
    tokenId: data.id,
    computer: data.name,
    studio: { id: org.id, name: org.name, status: org.status, trialEndsAt: org.trial_ends_at, paidUntil: org.paid_until, planId: org.plan_id },
  };
}

/** Why the studio can't add work right now, or null. */
export function workerBlocked(studio: WorkerStudio): string | null {
  return blockedMessage(accessFor(studio));
}

export type WorkerProject = { id: string; organization_id: string; name: string; slug: string; status: string };

/** A project of the worker's studio, or a 404 response. */
export async function workerProject(session: WorkerSession, projectId: string): Promise<WorkerProject | NextResponse> {
  if (!UUID_PATTERN.test(projectId)) return jsonError(404, "Project not found.");
  const { data, error } = await session.supabase
    .from("projects")
    .select("id, organization_id, name, slug, status")
    .eq("id", projectId)
    .eq("organization_id", session.studio.id)
    .maybeSingle<WorkerProject>();
  if (error) return jsonError(500, "Couldn't load the project. Try again.");
  if (!data) return jsonError(404, "Project not found.");
  return data;
}

/** Reads a JSON body, or null if it isn't a JSON object. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
