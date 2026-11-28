import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_PATTERN } from "@/lib/capture/photos";
import type { StudioStatus } from "@/lib/auth";
import { accessFor, blockedMessage, friendlyDbError } from "@/lib/studio/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROJECT_BUCKET, projectPhotoPaths, type LightingGroup } from "./paths";
import { countProjectPhotos, recordProjectPhoto } from "./queries";
import { uniqueProjectSlug } from "./slug";
import { listPlansWith } from "./worker-plans";

// The writes behind the PC app's API (/api/worker) and the browser camera's
// send path (/api/camera). Both check who is calling first. These functions
// then do the work with the service role, scoped to the studio by hand, so the
// rules are the same whichever door the photo came through.

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

/** The studio fields a write needs to check access and plan limits. */
export type WriteStudio = { id: string; status: StudioStatus; trialEndsAt: string; paidUntil: string | null; planId: string };

/** Who is writing: a database client scoped to one studio, already authorized. */
export type Writer = { supabase: SupabaseClient; studio: WriteStudio };

export type WriteProject = { id: string; organization_id: string; name: string; slug: string; status: string };

export type ProjectRef = { id: string; name: string; slug: string; status: string };

/** A service-role writer for a studio whose caller has already been authorized. */
export function adminWriter(studio: WriteStudio): Writer {
  return { supabase: createAdminClient(), studio };
}

/** Why the studio can't add work right now, or null. */
export function writeBlocked(studio: WriteStudio): string | null {
  return blockedMessage(accessFor(studio));
}

/** A project of the studio, or a 404 outcome. */
export async function loadProject(supabase: SupabaseClient, studioId: string, projectId: string): Promise<Outcome<WriteProject>> {
  if (!UUID_PATTERN.test(projectId)) return fail(404, "Project not found.");
  const { data, error } = await supabase
    .from("projects")
    .select("id, organization_id, name, slug, status")
    .eq("id", projectId)
    .eq("organization_id", studioId)
    .maybeSingle<WriteProject>();
  if (error) return fail(500, "Couldn't load the project. Try again.");
  if (!data) return fail(404, "Project not found.");
  return { ok: true, value: data };
}

/** Finds the project for a name, creating it if needed. The same name always means the same project. */
export async function findOrCreateProject(writer: Writer, name: string, kind: string): Promise<Outcome<{ project: ProjectRef; created: boolean }>> {
  const { supabase, studio } = writer;
  const wanted = uniqueProjectSlug(name, new Set());
  const existing = await supabase
    .from("projects")
    .select("id, name, slug, status")
    .eq("organization_id", studio.id)
    .eq("slug", wanted)
    .maybeSingle<ProjectRef>();
  if (existing.error) return fail(500, "Couldn't look up the project. Try again.");
  if (existing.data) return { ok: true, value: { project: existing.data, created: false } };

  const blocked = writeBlocked(studio);
  if (blocked) return fail(403, blocked);

  const { data, error } = await supabase
    .from("projects")
    .insert({ organization_id: studio.id, name, slug: wanted, kind })
    .select("id, name, slug, status")
    .single<ProjectRef>();
  if (error) {
    if (error.code === "23505") {
      const again = await supabase.from("projects").select("id, name, slug, status").eq("organization_id", studio.id).eq("slug", wanted).maybeSingle<ProjectRef>();
      if (again.data) return { ok: true, value: { project: again.data, created: false } };
    }
    const friendly = friendlyDbError(error);
    return fail(friendly ? 403 : 500, friendly ?? "Couldn't create the project. Try again.");
  }
  return { ok: true, value: { project: data, created: true } };
}

export type PhotoUpload = { photoId: string; full: string; thumb: string; editedFull?: string; editedThumb?: string };

/**
 * Reserves a photo: a new photo id and one-time upload URLs (the web-size image
 * and its thumbnail, or four with an auto-edit). Refuses early when the studio
 * or project can't take more photos; the database checks again when the photo
 * is recorded.
 */
export async function reservePhotoUpload(writer: Writer, project: WriteProject, edited: boolean): Promise<Outcome<PhotoUpload>> {
  const { supabase, studio } = writer;
  const blocked = writeBlocked(studio);
  if (blocked) return fail(403, blocked);
  if (project.status === "archived") return fail(409, "This project is archived. Restore it to add photos.");

  const [plan, counts] = await Promise.all([listPlansWith(supabase, studio.planId), countProjectPhotos(project.id, supabase)]);
  if (plan && counts.total >= plan.photos_per_event) {
    return fail(403, `This project has reached ${plan.photos_per_event.toLocaleString("en-IN")} photos, the most the ${plan.name} plan allows.`);
  }

  // Caps files in the folder, so upload links that are never confirmed can't
  // fill storage past the plan's photo limit.
  const room = await supabase.rpc("project_has_file_room", { p_project: project.id });
  if (room.error) return fail(500, "Couldn't prepare the upload. Try again.");
  if (room.data !== true) return fail(403, "This project has too many unfinished uploads. Try again later.");

  const photoId = crypto.randomUUID();
  const paths = projectPhotoPaths(project.organization_id, project.id, photoId);
  const bucket = supabase.storage.from(PROJECT_BUCKET);
  const wanted = edited ? [paths.full, paths.thumb, paths.editedFull, paths.editedThumb] : [paths.full, paths.thumb];
  const links = await Promise.all(wanted.map((path) => bucket.createSignedUploadUrl(path)));
  if (links.some((l) => l.error || !l.data)) return fail(500, "Couldn't prepare the upload. Try again.");
  const [full, thumb, editedFull, editedThumb] = links.map((l) => l.data?.signedUrl ?? "");
  return { ok: true, value: { photoId, full, thumb, ...(edited ? { editedFull, editedThumb } : {}) } };
}

/** A number, null when missing, NaN (rejected later) when not a number. */
function nullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : Number.NaN;
}

/** A string, null when missing or empty, "invalid" (rejected later) when not a string. */
function nullableString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" ? v : "invalid";
}

/** Records a photo once both of its files are uploaded. `body` is the JSON the app sent. */
export async function recordPhoto(writer: Writer, project: WriteProject, body: Record<string, unknown>, source: "worker" | "browser"): Promise<Outcome<{ duplicate: boolean }>> {
  const result = await recordProjectPhoto(
    writer.supabase,
    writer.supabase,
    project,
    {
      photoId: typeof body.photoId === "string" ? body.photoId : "",
      fileName: typeof body.fileName === "string" ? body.fileName : "",
      width: Number(body.width),
      height: Number(body.height),
      bytes: nullableNumber(body.bytes),
      takenAt: nullableString(body.takenAt),
      tone: nullableString(body.tone),
      edit: body.edited === true ? { lighting: (typeof body.lighting === "string" ? body.lighting : "") as LightingGroup, look: typeof body.look === "string" ? body.look : "" } : null,
    },
    source,
    friendlyDbError,
  );
  if (!result.ok) return fail(result.status ?? 500, result.error);
  return { ok: true, value: { duplicate: Boolean(result.duplicate) } };
}
