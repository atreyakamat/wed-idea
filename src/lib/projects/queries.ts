import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { createClient } from "@/lib/supabase/server";
import type { ProjectKind } from "./form";
import { LIGHTING_GROUPS, LOOK_ID_PATTERN, PROJECT_BUCKET, projectPhotoPaths, type LightingGroup } from "./paths";

export type ProjectStatus = "draft" | "published" | "archived";

export type Project = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  kind: ProjectKind;
  shoot_date: string | null;
  status: ProjectStatus;
  access_token: string;
  published_at: string | null;
  first_published_at: string | null;
  gallery_expires_at: string | null;
  created_at: string;
};

export type ProjectSummary = Project & { photoCount: number; coverUrl: string | null };

export type ProjectPhoto = {
  id: string;
  fileName: string;
  width: number;
  height: number;
  hidden: boolean;
  /** The edited version when there is one, otherwise the plain photo. */
  thumbUrl: string;
  fullUrl: string;
  /** The plain photo, when an edited version is shown. */
  originalUrl: string | null;
  lighting: LightingGroup | null;
  look: string | null;
  tone: string | null;
};

const PROJECT_COLUMNS =
  "id, organization_id, name, slug, kind, shoot_date, status, access_token, published_at, first_published_at, gallery_expires_at, created_at";

/** Signed links to the studio's own photos stay valid this long. */
const SIGNED_URL_SECONDS = 60 * 60;
/**
 * Signed links in the public gallery are shorter-lived, so hiding a photo or
 * unpublishing takes effect quickly even for a link someone copied.
 */
export const PUBLIC_SIGNED_URL_SECONDS = 15 * 60;

/** Photos shown per page, in the dashboard and the public gallery. */
export const PHOTO_PAGE_SIZE = 60;

/** The studio's projects, newest first, with photo counts and a cover. RLS limits rows to members. */
export async function listProjects(organizationId: string): Promise<ProjectSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(`${PROJECT_COLUMNS}, project_photos (count)`)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .overrideTypes<(Project & { project_photos: { count: number }[] })[], { merge: false }>();
  if (error) throw new Error(`Couldn't load projects: ${error.message}`);

  const rows = data ?? [];
  // One cover per project: its first visible photo.
  const covers = await Promise.all(
    rows.map(async (p) => {
      const { data: first } = await supabase
        .from("project_photos")
        .select("thumb_path")
        .eq("project_id", p.id)
        .eq("hidden", false)
        .order("taken_at", { ascending: true, nullsFirst: false })
        .order("file_name", { ascending: true })
        .limit(1)
        .maybeSingle();
      return first?.thumb_path ?? null;
    }),
  );
  const coverPaths = covers.filter((c): c is string => Boolean(c));
  const signed = coverPaths.length ? await supabase.storage.from(PROJECT_BUCKET).createSignedUrls(coverPaths, SIGNED_URL_SECONDS) : { data: [] };
  const urlFor = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  return rows.map(({ project_photos, ...p }, i) => ({
    ...p,
    photoCount: project_photos[0]?.count ?? 0,
    coverUrl: covers[i] ? (urlFor.get(covers[i]) ?? null) : null,
  }));
}

export async function getProject(organizationId: string, projectId: string): Promise<Project | null> {
  if (!UUID_PATTERN.test(projectId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", projectId)
    .maybeSingle<Project>();
  if (error) throw new Error(`Couldn't load the project: ${error.message}`);
  return data;
}

export type PhotoCounts = { total: number; visible: number };

export async function countProjectPhotos(projectId: string, client?: SupabaseClient): Promise<PhotoCounts> {
  const supabase = client ?? (await createClient());
  const [total, visible] = await Promise.all([
    supabase.from("project_photos").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    supabase.from("project_photos").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("hidden", false),
  ]);
  if (total.error || visible.error) throw new Error("Couldn't count the project's photos.");
  return { total: total.count ?? 0, visible: visible.count ?? 0 };
}

async function allFileNames(supabase: SupabaseClient, table: "project_photos" | "project_removed_files", projectId: string): Promise<string[]> {
  const names: string[] = [];
  // PostgREST caps a response at 1,000 rows by default.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("file_name")
      .eq("project_id", projectId)
      .order("file_name")
      .range(from, from + 999);
    if (error) throw new Error("Couldn't list the project's photos.");
    names.push(...data.map((r) => r.file_name as string));
    if (data.length < 1000) return names;
  }
}

/**
 * File names the uploaders should skip: photos already in the project and
 * photos that were deleted from it (so they don't come back).
 */
export async function projectFileNames(projectId: string, client?: SupabaseClient): Promise<string[]> {
  const supabase = client ?? (await createClient());
  const [kept, removed] = await Promise.all([allFileNames(supabase, "project_photos", projectId), allFileNames(supabase, "project_removed_files", projectId)]);
  return [...new Set([...kept, ...removed])];
}

type PhotoRow = {
  id: string;
  file_name: string;
  path: string;
  thumb_path: string;
  edited_path: string | null;
  edited_thumb_path: string | null;
  lighting: LightingGroup | null;
  look: string | null;
  tone: string | null;
  width: number;
  height: number;
  hidden: boolean;
};

/**
 * One page of a project's photos in shooting order (time taken, then file
 * name), with signed links. `visibleOnly` is for the public gallery.
 */
export async function projectPhotoPage(
  supabase: SupabaseClient,
  projectId: string,
  offset: number,
  { visibleOnly = false, limit = PHOTO_PAGE_SIZE, expiresIn = SIGNED_URL_SECONDS }: { visibleOnly?: boolean; limit?: number; expiresIn?: number } = {},
): Promise<{ photos: ProjectPhoto[]; hasMore: boolean }> {
  let query = supabase
    .from("project_photos")
    .select("id, file_name, path, thumb_path, edited_path, edited_thumb_path, lighting, look, tone, width, height, hidden")
    .eq("project_id", projectId)
    .order("taken_at", { ascending: true, nullsFirst: false })
    .order("file_name", { ascending: true })
    .range(offset, offset + limit);
  if (visibleOnly) query = query.eq("hidden", false);
  const { data, error } = await query.overrideTypes<PhotoRow[], { merge: false }>();
  if (error) throw new Error(`Couldn't load photos: ${error.message}`);

  const rows = (data ?? []).slice(0, limit);
  const paths = rows.flatMap((p) => [p.edited_thumb_path ?? p.thumb_path, p.edited_path ?? p.path, ...(p.edited_path ? [p.path] : [])]);
  const signed = paths.length ? await supabase.storage.from(PROJECT_BUCKET).createSignedUrls(paths, expiresIn) : { data: [], error: null };
  if (signed.error) throw new Error(`Couldn't load photos: ${signed.error.message}`);
  const urlFor = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  const photos = rows.flatMap((p) => {
    const thumbUrl = urlFor.get(p.edited_thumb_path ?? p.thumb_path);
    const fullUrl = urlFor.get(p.edited_path ?? p.path);
    const originalUrl = p.edited_path ? (urlFor.get(p.path) ?? null) : null;
    if (!thumbUrl || !fullUrl) return [];
    return [{ id: p.id, fileName: p.file_name, width: p.width, height: p.height, hidden: p.hidden, thumbUrl, fullUrl, originalUrl, lighting: p.lighting, look: p.look, tone: p.tone }];
  });
  return { photos, hasMore: (data?.length ?? 0) > limit };
}

export type NewProjectPhoto = {
  photoId: string;
  fileName: string;
  width: number;
  height: number;
  bytes: number | null;
  takenAt: string | null;
  /** Set when the PC app also uploaded an auto-edited version. */
  edit?: { lighting: LightingGroup; look: string } | null;
  /** Average colour "#rrggbb", shown while the photo loads. */
  tone?: string | null;
};

export const TONE_PATTERN = /^#[0-9a-f]{6}$/;

export type RecordResult = { ok: true; duplicate?: boolean } | { ok: false; error: string; status?: number };

/** Checks the shape of a photo the browser or the PC app says it uploaded. */
export function validateNewPhoto(input: NewProjectPhoto): string | null {
  if (!UUID_PATTERN.test(input.photoId)) return "Invalid photo.";
  if (typeof input.fileName !== "string" || !input.fileName.trim() || input.fileName.length > 255) return "Invalid file name.";
  for (const n of [input.width, input.height]) {
    if (!Number.isInteger(n) || n < 1 || n > 20000) return "Invalid photo size.";
  }
  if (input.bytes !== null && (!Number.isInteger(input.bytes) || input.bytes < 0)) return "Invalid file size.";
  if (input.takenAt !== null && Number.isNaN(Date.parse(input.takenAt))) return "Invalid capture time.";
  if (input.tone != null && (typeof input.tone !== "string" || !TONE_PATTERN.test(input.tone))) return "Invalid tone.";
  if (input.edit) {
    if (!(LIGHTING_GROUPS as readonly string[]).includes(input.edit.lighting)) return "Unknown lighting.";
    if (typeof input.edit.look !== "string" || !LOOK_ID_PATTERN.test(input.edit.look) || input.edit.look.length > 40) return "Unknown look.";
  }
  return null;
}

/**
 * Records a project photo after its two files are in storage. Paths are
 * rebuilt from ids, never taken from the caller. When the same file name is
 * already in the project (a re-upload), the new files are removed.
 * `cleanup` must be allowed to delete from the bucket (the service role).
 */
export async function recordProjectPhoto(
  supabase: SupabaseClient,
  cleanup: SupabaseClient,
  project: { id: string; organization_id: string },
  input: NewProjectPhoto,
  source: "browser" | "worker",
  friendly: (error: { code?: string; message?: string; hint?: string | null }) => string | null,
): Promise<RecordResult> {
  const invalid = validateNewPhoto(input);
  if (invalid) return { ok: false, error: invalid, status: 400 };

  const paths = projectPhotoPaths(project.organization_id, project.id, input.photoId);
  const folder = paths.full.slice(0, paths.full.lastIndexOf("/"));
  const listed = await supabase.storage.from(PROJECT_BUCKET).list(folder, { search: input.photoId });
  const names = new Set((listed.data ?? []).map((f) => f.name));
  const expected = [`${input.photoId}.jpg`, `${input.photoId}.thumb.jpg`, ...(input.edit ? [`${input.photoId}.edit.jpg`, `${input.photoId}.edit.thumb.jpg`] : [])];
  if (!expected.every((n) => names.has(n))) {
    // 422, not 409: the app should retry this photo, not give up on the project.
    return { ok: false, error: "Upload didn't finish. Try that photo again.", status: 422 };
  }

  const { error } = await supabase.from("project_photos").insert({
    id: input.photoId,
    project_id: project.id,
    organization_id: project.organization_id,
    file_name: input.fileName.trim(),
    path: paths.full,
    thumb_path: paths.thumb,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    taken_at: input.takenAt,
    source,
    tone: input.tone ?? null,
    ...(input.edit ? { edited_path: paths.editedFull, edited_thumb_path: paths.editedThumb, lighting: input.edit.lighting, look: input.edit.look } : {}),
  });
  if (!error) return { ok: true };

  // Same photo id: an earlier attempt was recorded and only its reply was
  // lost. The files belong to that row, so keep them.
  if (error.code === "23505" && /project_photos_pkey/.test(error.message ?? "")) return { ok: true, duplicate: true };

  // A definite refusal (same file name already there, a limit, access or a
  // project rule): the files will never be recorded, so remove them. Any
  // other error may be temporary; keep the files so a retry can record them.
  const refusal = REFUSAL_STATUS[error.hint ?? ""];
  if (error.code === "23505" || refusal) await cleanup.storage.from(PROJECT_BUCKET).remove([paths.full, paths.thumb, paths.editedFull, paths.editedThumb]);
  if (error.code === "23505") return { ok: true, duplicate: true };
  if (refusal) return { ok: false, error: friendly(error) ?? "Couldn't save the photo.", status: refusal };
  return { ok: false, error: "Couldn't save the photo. Try again.", status: 500 };
}

/** HTTP status for each kind of database refusal. 403 and 409 tell the PC app to stop. */
const REFUSAL_STATUS: Record<string, number> = { plan_limit: 403, studio_access: 403, project_rule: 409 };


/** How many guests ❤ each photo of a project, most loved first. */
export async function heartCounts(projectId: string, client?: SupabaseClient): Promise<{ photoId: string; hearts: number }[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("project_heart_counts", { p_project: projectId });
  if (error) return [];
  return ((data ?? []) as { photo_id: string; hearts: number | string }[])
    .map((r) => ({ photoId: r.photo_id, hearts: Number(r.hearts) }))
    .sort((a, b) => b.hearts - a.hearts);
}

/** Specific photos of a project, signed, in the order given. */
export async function photosByIds(supabase: SupabaseClient, projectId: string, ids: string[]): Promise<ProjectPhoto[]> {
  const wanted = ids.filter((id) => UUID_PATTERN.test(id)).slice(0, 200);
  if (!wanted.length) return [];
  const { data } = await supabase
    .from("project_photos")
    .select("id, file_name, path, thumb_path, edited_path, edited_thumb_path, lighting, look, tone, width, height, hidden")
    .eq("project_id", projectId)
    .in("id", wanted)
    .overrideTypes<PhotoRow[], { merge: false }>();
  const rows = data ?? [];
  const paths = rows.flatMap((p) => [p.edited_thumb_path ?? p.thumb_path, p.edited_path ?? p.path]);
  const signed = paths.length ? await supabase.storage.from(PROJECT_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS) : { data: [] };
  const urlFor = new Map((signed.data ?? []).map((x) => [x.path, x.signedUrl]));
  const byId = new Map(
    rows.flatMap((p) => {
      const thumbUrl = urlFor.get(p.edited_thumb_path ?? p.thumb_path);
      const fullUrl = urlFor.get(p.edited_path ?? p.path);
      return thumbUrl && fullUrl
        ? [[p.id, { id: p.id, fileName: p.file_name, width: p.width, height: p.height, hidden: p.hidden, thumbUrl, fullUrl, originalUrl: null, lighting: p.lighting, look: p.look, tone: p.tone }] as const]
        : [];
    }),
  );
  return wanted.flatMap((id) => (byId.has(id) ? [byId.get(id) as ProjectPhoto] : []));
}
