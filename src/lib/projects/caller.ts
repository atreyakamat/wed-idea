// Who is calling the worker API, and what that caller may touch.
//
// Pure rules only. The Supabase calls live in worker-api.ts and reach these
// rules through UserCallerStore, so the rules can be tested without a server.

import type { WorkerStudio } from "./worker-api";
import { WORKER_TOKEN_PATTERN } from "./worker-token";

export type CallerKind = "worker" | "user";

/** A worker token ("cwp_wk_…") is the PC app's. Any other bearer value is a Supabase user access token. */
export function callerKind(credential: string): CallerKind {
  return WORKER_TOKEN_PATTERN.test(credential) ? "worker" : "user";
}

/** The raw value after "Bearer ", whatever it is, or null. */
export function bearerCredential(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  return m ? m[1] : null;
}

const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

/** Shape only, so junk never reaches Supabase. Supabase still checks the signature. */
export function looksLikeJwt(credential: string): boolean {
  return credential.length <= 8192 && JWT_SHAPE.test(credential);
}

/** Every studio role. Membership rows only ever hold these (organization_members.role is an enum). */
export const OPERATOR_ROLES: readonly string[] = ["owner", "admin", "operator"];

/** The role may upload and run projects: operator or higher, which is every studio role today. */
export function canOperate(role: string | null | undefined): boolean {
  return typeof role === "string" && OPERATOR_ROLES.includes(role);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The value when it is a UUID string, else null. */
export function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

/** Where a user-token request points: a project (its studio is looked up) or a studio. */
export type CallerScope = { projectId?: string; organizationId?: unknown };

/** The lookups a user token needs. Each runs as the user (RLS), except verify, which asks Supabase. */
export type UserCallerStore = {
  /** The user behind an access token, or null if Supabase rejects it. Throws on a failed lookup. */
  verify(token: string): Promise<{ id: string } | null>;
  /** False when this user has used up the request budget. */
  allow(userId: string): Promise<boolean>;
  /** The studio of a project the user can see, or null. */
  projectStudio(projectId: string): Promise<string | null>;
  /** The user's role in a studio, or null if they aren't a member. */
  role(userId: string, studioId: string): Promise<string | null>;
  studio(studioId: string): Promise<WorkerStudio | null>;
};

export type UserCaller =
  | { ok: true; userId: string; role: string; studio: WorkerStudio }
  | { ok: false; status: number; error: string };

export const SIGN_IN_AGAIN = "Your sign-in has ended. Sign in again and retry.";
export const PROJECT_NOT_FOUND = "Project not found.";
const NOT_A_MEMBER = "You aren't a member of this studio.";

/**
 * Decides whether a signed-in user may act for a project's studio, or for the
 * studio named in the request. Someone outside the studio gets the same answer
 * as a project that doesn't exist, so project ids can't be probed.
 */
export async function resolveUserCaller(store: UserCallerStore, token: string, scope: CallerScope): Promise<UserCaller> {
  const fail = (status: number, error: string): UserCaller => ({ ok: false, status, error });

  const user = await store.verify(token);
  if (!user) return fail(401, SIGN_IN_AGAIN);
  if (!(await store.allow(user.id))) return fail(429, "Too many requests. Slow down and try again in a minute.");

  let studioId: string | null;
  if (scope.projectId !== undefined) {
    const projectId = uuidOrNull(scope.projectId);
    studioId = projectId ? await store.projectStudio(projectId) : null;
    if (!studioId) return fail(404, PROJECT_NOT_FOUND);
  } else {
    studioId = uuidOrNull(scope.organizationId);
    if (!studioId) return fail(400, "Say which studio this is for. Send its organizationId.");
  }

  const viaProject = scope.projectId !== undefined;
  const role = await store.role(user.id, studioId);
  if (!role) return viaProject ? fail(404, PROJECT_NOT_FOUND) : fail(403, NOT_A_MEMBER);
  if (!canOperate(role)) return fail(403, "Your role in this studio can't add photos or projects.");

  const studio = await store.studio(studioId);
  if (!studio) return viaProject ? fail(404, PROJECT_NOT_FOUND) : fail(403, NOT_A_MEMBER);
  return { ok: true, userId: user.id, role, studio };
}
