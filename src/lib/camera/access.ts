import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { adminWriter, writeBlocked, type WriteProject, type WriteStudio, type Writer } from "@/lib/projects/project-writes";
import { jsonError } from "@/lib/projects/worker-api";
import { allow } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { firstSendableMembership, isJsonBody, isSameOrigin, sendableMembership, type CameraProject, type CameraState, type MemberRole } from "./rules";

// Who may use the browser camera's send path. Every check runs against the
// signed-in user's own session (the cookie), and the database's row rules limit
// what they can read. Writes then run with the service role, scoped to the
// studio the membership names, the same way the PC app's worker routes work.

type Membership = { studioId: string; role: MemberRole; studio: WriteStudio & { name: string } };

type Caller = { userId: string; email: string | null; supabase: SupabaseClient };

export type CameraSession = { caller: Caller; role: MemberRole; writer: Writer; studioName: string };

/** The signed-in user on this request, or null. */
export async function currentCaller(): Promise<Caller | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : null, supabase };
}

/** The user's studio memberships, oldest first. RLS limits the rows to the caller's own. */
export async function readMemberships(caller: Caller): Promise<Membership[] | null> {
  const { data, error } = await caller.supabase
    .from("organization_members")
    .select("role, created_at, organizations (id, name, status, trial_ends_at, paid_until, plan_id)")
    .eq("user_id", caller.userId)
    .order("created_at", { ascending: true });
  if (error) return null;
  return (data ?? []).flatMap((row) => {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (!org) return [];
    return [
      {
        studioId: org.id,
        role: row.role as MemberRole,
        studio: { id: org.id, name: org.name, status: org.status, trialEndsAt: org.trial_ends_at, paidUntil: org.paid_until, planId: org.plan_id },
      },
    ];
  });
}

/** Refuses cross-site and non-JSON POSTs before anything else runs. Null when the request may proceed. */
export function postGuard(request: Request): Response | null {
  if (!isSameOrigin(request.headers.get("origin"), request.url)) return jsonError(403, "Send photos from the site itself.");
  if (!isJsonBody(request.headers.get("content-type"))) return jsonError(415, "Send the request as JSON.");
  return null;
}

async function limited(caller: Caller): Promise<Response | null> {
  // Far above a real send (one request per photo step), so only a runaway script hits it.
  if (!(await allow(`camera:${caller.userId}`, 1200, 60))) return jsonError(429, "Too many requests. Slow down and try again in a minute.");
  return null;
}

/** The caller's studio for creating or listing projects, or an error response. */
export async function studioSession(): Promise<CameraSession | Response> {
  const caller = await currentCaller();
  if (!caller) return jsonError(401, "Sign in to send to your studio.");
  const rows = await readMemberships(caller);
  if (!rows) return jsonError(500, "Couldn't check your studio. Try again.");
  const row = firstSendableMembership(rows);
  if (!row) return jsonError(403, rows.length ? "Your role can't send photos to this studio." : "Your account isn't in a studio yet.");
  const block = await limited(caller);
  if (block) return block;
  return { caller, role: row.role, writer: adminWriter(row.studio), studioName: row.studio.name };
}

/** The caller's studio and one of its projects, or an error response. Used by the upload and photo routes. */
export async function projectSession(projectId: string): Promise<{ session: CameraSession; project: WriteProject } | Response> {
  if (!UUID_PATTERN.test(projectId)) return jsonError(404, "Project not found.");
  const caller = await currentCaller();
  if (!caller) return jsonError(401, "Sign in to send to your studio.");
  // Read through the caller's session, so a project they can't see is "not found".
  const { data, error } = await caller.supabase
    .from("projects")
    .select("id, organization_id, name, slug, status")
    .eq("id", projectId)
    .maybeSingle<WriteProject>();
  if (error) return jsonError(500, "Couldn't load the project. Try again.");
  if (!data) return jsonError(404, "Project not found.");
  const rows = await readMemberships(caller);
  if (!rows) return jsonError(500, "Couldn't check your studio. Try again.");
  const row = sendableMembership(rows, data.organization_id);
  if (!row) return jsonError(403, "Your role can't send photos to this studio.");
  const block = await limited(caller);
  if (block) return block;
  return { session: { caller, role: row.role, writer: adminWriter(row.studio), studioName: row.studio.name }, project: data };
}

/** What the camera's send panel shows for the caller right now. */
export async function cameraState(): Promise<CameraState> {
  const caller = await currentCaller();
  if (!caller) return { signedIn: false };
  const rows = await readMemberships(caller);
  if (!rows) throw new Error("Couldn't check your studio.");
  const row = firstSendableMembership(rows);
  if (!row) return { signedIn: true, email: caller.email, studio: null };

  const { data, error } = await caller.supabase
    .from("projects")
    .select("id, name, project_photos (count)")
    .eq("organization_id", row.studioId)
    .order("created_at", { ascending: false })
    .limit(200)
    .overrideTypes<{ id: string; name: string; project_photos: { count: number }[] }[], { merge: false }>();
  if (error) throw new Error("Couldn't list projects.");
  const projects: CameraProject[] = (data ?? []).map((p) => ({ id: p.id, name: p.name, photoCount: p.project_photos[0]?.count ?? 0 }));
  return {
    signedIn: true,
    email: caller.email,
    studio: { id: row.studioId, name: row.studio.name, role: row.role },
    blocked: writeBlocked(row.studio),
    projects,
  };
}
