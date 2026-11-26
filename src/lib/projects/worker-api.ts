import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { StudioStatus } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { allow } from "@/lib/rate-limit";
import { accessFor, blockedMessage } from "@/lib/studio/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerCredential, callerKind, looksLikeJwt, resolveUserCaller, type CallerScope, type UserCallerStore } from "./caller";
import { hashWorkerToken } from "./worker-token";
import { UUID_PATTERN } from "@/lib/capture/photos";

// The PC app's API, and the web app's (the Wedding Pola PWA).
//
// Two kinds of caller, both on "Authorization: Bearer …":
// - A worker token ("cwp_wk_…", the PC app). Calls run with the service role,
//   scoped by hand to the token's studio. Unchanged by the web app work.
// - A Supabase user access token (a signed-in studio member). The token is
//   checked with Supabase, and the user must be an owner, admin or operator
//   of the studio (the project's studio, or the organizationId the request
//   names). Calls then run as the user, so RLS applies. The service role is
//   used only for the project room check (the database revokes that RPC from
//   signed-in users) and for cleanup, after the membership check.
// The request and response shapes are the same for both kinds of caller. A
// user-token caller must send organizationId on routes with no project id.
//
// The database still applies plan limits and access rules to every write.

export type WorkerStudio = {
  id: string;
  name: string;
  status: StudioStatus;
  trialEndsAt: string;
  paidUntil: string | null;
  planId: string;
};

export type WorkerSession = {
  caller: "worker" | "user";
  /** What routes read and write with. For a worker token this is the service-role client. */
  supabase: SupabaseClient;
  /** Service role. For a worker token this is the same object as supabase. */
  admin: SupabaseClient;
  tokenId: string | null;
  userId: string | null;
  computer: string;
  studio: WorkerStudio;
};

type TokenRow = {
  id: string;
  name: string;
  last_used_at: string | null;
  organizations: { id: string; name: string; status: StudioStatus; trial_ends_at: string; paid_until: string | null; plan_id: string } | null;
};

/** How often "last seen" is written, so a busy upload doesn't write on every call. */
const LAST_SEEN_EVERY_MS = 5 * 60 * 1000;

const WORKER_LOGIN = "Missing or malformed token. Run `cwp-worker login` again.";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * The studio a request's caller belongs to, or a 401/403/404 response. `scope`
 * names the project (or studio) a user token is acting on; worker tokens
 * ignore it.
 */
export async function authenticateWorker(request: Request, scope: CallerScope = {}): Promise<WorkerSession | NextResponse> {
  const credential = bearerCredential(request.headers.get("authorization"));
  if (!credential) return jsonError(401, WORKER_LOGIN);
  if (callerKind(credential) === "user") return authenticateUser(credential, scope);

  const token = credential;
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
    caller: "worker",
    supabase,
    admin: supabase,
    tokenId: data.id,
    userId: null,
    computer: data.name,
    studio: { id: org.id, name: org.name, status: org.status, trialEndsAt: org.trial_ends_at, paidUntil: org.paid_until, planId: org.plan_id },
  };
}

/** A signed-in studio member's access token. The membership rule is in caller.ts. */
async function authenticateUser(token: string, scope: CallerScope): Promise<WorkerSession | NextResponse> {
  if (!looksLikeJwt(token)) return jsonError(401, WORKER_LOGIN);
  const client = userClient(token);
  try {
    const result = await resolveUserCaller(userStore(client), token, scope);
    if (!result.ok) return jsonError(result.status, result.error);
    return {
      caller: "user",
      supabase: client,
      admin: createAdminClient(),
      tokenId: null,
      userId: result.userId,
      computer: "Web app",
      studio: result.studio,
    };
  } catch {
    return jsonError(500, "Couldn't check your access. Try again.");
  }
}

/** A client that acts as the user (RLS applies). Its access token is checked by verify() before use. */
function userClient(token: string): SupabaseClient {
  const env = publicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(env.NEXT_PUBLIC_SUPABASE_SCHEMA ? { db: { schema: env.NEXT_PUBLIC_SUPABASE_SCHEMA } } : {}),
  }) as unknown as SupabaseClient;
}

type OrgRow = { id: string; name: string; status: StudioStatus; trial_ends_at: string; paid_until: string | null; plan_id: string };

function userStore(client: SupabaseClient): UserCallerStore {
  return {
    async verify(token) {
      const { data, error } = await client.auth.getUser(token);
      // A rejected token is a 401. Anything else (network, server) is a failed check.
      if (error) {
        if (error.status && error.status < 500) return null;
        throw new Error(error.message);
      }
      return data.user ? { id: data.user.id } : null;
    },
    allow(userId) {
      return allow(`user:${userId}`, 1200, 60);
    },
    async projectStudio(projectId) {
      const { data, error } = await client.from("projects").select("organization_id").eq("id", projectId).maybeSingle<{ organization_id: string }>();
      if (error) throw new Error(error.message);
      return data?.organization_id ?? null;
    },
    async role(userId, studioId) {
      const { data, error } = await client
        .from("organization_members")
        .select("role")
        .eq("organization_id", studioId)
        .eq("user_id", userId)
        .maybeSingle<{ role: string }>();
      if (error) throw new Error(error.message);
      return data?.role ?? null;
    },
    async studio(studioId) {
      const { data, error } = await client
        .from("organizations")
        .select("id, name, status, trial_ends_at, paid_until, plan_id")
        .eq("id", studioId)
        .maybeSingle<OrgRow>();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { id: data.id, name: data.name, status: data.status, trialEndsAt: data.trial_ends_at, paidUntil: data.paid_until, planId: data.plan_id };
    },
  };
}

/** Why the studio can't add work right now, or null. */
export function workerBlocked(studio: WorkerStudio): string | null {
  return blockedMessage(accessFor(studio));
}

export type WorkerProject = { id: string; organization_id: string; name: string; slug: string; status: string };

/** A project of the caller's studio, or a 404 response. */
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

/**
 * CORS preflight for the worker API. Needs no sign-in. The allowed origin and
 * the allowed headers come from next.config.ts (PIXI_STUDIO_ORIGIN).
 */
export function workerPreflight(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
