import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { isGroup, type Group } from "@/lib/looks/data";
import type { ShotCheck } from "@/lib/quality/flags";
import type { StylePrefs } from "@/lib/looks/engine";
import { EDIT_VERSION_PATTERN, editVersionPaths, LOOK_ID_PATTERN, PROJECT_BUCKET } from "./paths";

/** One photo in the review screen's list (links are signed separately, a few at a time). */
export type ReviewItem = {
  id: string;
  fileName: string;
  width: number;
  height: number;
  hidden: boolean;
  lighting: Group | null;
  look: string | null;
  reviewed: boolean;
  tone: string | null;
  /** Missed-shot measures, once the photo has been checked. */
  check: ShotCheck | null;
};

export type ReviewLinks = { id: string; plainThumb: string; plainFull: string; editedThumb: string | null; editedFull: string | null };

/** Every photo is listed, at most this many. */
export const REVIEW_LIMIT = 5000;
/** Signed links last this long in the review screen. */
const REVIEW_LINK_SECONDS = 60 * 60;

type Row = {
  id: string;
  file_name: string;
  width: number;
  height: number;
  hidden: boolean;
  lighting: string | null;
  look: string | null;
  reviewed_at: string | null;
  tone: string | null;
  quality: unknown;
  path: string;
  thumb_path: string;
  edited_path: string | null;
  edited_thumb_path: string | null;
};

/** A project's photos in shooting order, for review. */
export async function reviewItems(supabase: SupabaseClient, projectId: string): Promise<ReviewItem[]> {
  const out: ReviewItem[] = [];
  for (let from = 0; from < REVIEW_LIMIT; from += 1000) {
    const { data, error } = await supabase
      .from("project_photos")
      .select("id, file_name, width, height, hidden, lighting, look, reviewed_at, tone, quality")
      .eq("project_id", projectId)
      .order("taken_at", { ascending: true, nullsFirst: false })
      .order("file_name", { ascending: true })
      .range(from, from + 999)
      .overrideTypes<Row[], { merge: false }>();
    if (error) throw new Error(`Couldn't load photos: ${error.message}`);
    for (const r of data ?? []) {
      out.push({
        id: r.id,
        fileName: r.file_name,
        width: r.width,
        height: r.height,
        hidden: r.hidden,
        lighting: isGroup(r.lighting) ? r.lighting : null,
        look: r.look,
        reviewed: Boolean(r.reviewed_at),
        tone: r.tone,
        check: parseCheck(r.quality),
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** Signed links to a few photos' plain and edited files. */
export async function reviewLinks(supabase: SupabaseClient, projectId: string, ids: string[]): Promise<ReviewLinks[]> {
  const wanted = ids.filter((id) => UUID_PATTERN.test(id)).slice(0, 100);
  if (!wanted.length) return [];
  const { data, error } = await supabase
    .from("project_photos")
    .select("id, path, thumb_path, edited_path, edited_thumb_path")
    .eq("project_id", projectId)
    .in("id", wanted)
    .overrideTypes<Pick<Row, "id" | "path" | "thumb_path" | "edited_path" | "edited_thumb_path">[], { merge: false }>();
  if (error || !data?.length) return [];
  const paths = data.flatMap((r) => [r.path, r.thumb_path, r.edited_path, r.edited_thumb_path].filter((p): p is string => Boolean(p)));
  const signed = await supabase.storage.from(PROJECT_BUCKET).createSignedUrls(paths, REVIEW_LINK_SECONDS);
  const urlFor = new Map((signed.data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));
  return data.flatMap((r) => {
    const plainThumb = urlFor.get(r.thumb_path);
    const plainFull = urlFor.get(r.path);
    if (!plainThumb || !plainFull) return [];
    return [
      {
        id: r.id,
        plainThumb,
        plainFull,
        editedThumb: r.edited_thumb_path ? (urlFor.get(r.edited_thumb_path) ?? null) : null,
        editedFull: r.edited_path ? (urlFor.get(r.edited_path) ?? null) : null,
      },
    ];
  });
}

/** The look a studio has settled on for each kind of light. */
/** The look each kind of light gets: a default the studio chose, else the look learnt from Review. */
export async function studioStyle(supabase: SupabaseClient, organizationId: string): Promise<StylePrefs> {
  const [{ data }, { data: chosen }] = await Promise.all([
    supabase.rpc("studio_style", { p_org: organizationId }),
    supabase.from("studio_look_defaults").select("lighting, look").eq("organization_id", organizationId),
  ]);
  const style: StylePrefs = {};
  for (const row of (data ?? []) as { lighting: string; look: string }[]) {
    if (isGroup(row.lighting) && LOOK_ID_PATTERN.test(row.look)) style[row.lighting] = row.look;
  }
  for (const row of (chosen ?? []) as { lighting: string; look: string }[]) {
    if (isGroup(row.lighting) && LOOK_ID_PATTERN.test(row.look)) style[row.lighting] = row.look;
  }
  return style;
}

export type EditChoice = { version: string; lighting: Group; look: string } | null;

export function validEditChoice(choice: unknown): choice is EditChoice {
  if (choice === null) return true;
  if (!choice || typeof choice !== "object") return false;
  const c = choice as Record<string, unknown>;
  return (
    typeof c.version === "string" &&
    EDIT_VERSION_PATTERN.test(c.version) &&
    isGroup(c.lighting) &&
    typeof c.look === "string" &&
    LOOK_ID_PATTERN.test(c.look) &&
    c.look.length <= 40
  );
}

/**
 * Points a photo at a new edit (or back at the plain photo) and removes the
 * old edit's files. `admin` is the service-role client: callers check the
 * user belongs to the studio first. Returns an error message or null.
 */
export async function applyEditChoice(
  admin: SupabaseClient,
  project: { id: string; organization_id: string },
  photoId: string,
  choice: EditChoice,
): Promise<string | null> {
  if (!UUID_PATTERN.test(photoId) || !validEditChoice(choice)) return "Invalid edit.";
  const { data: row } = await admin
    .from("project_photos")
    .select("id, path, thumb_path, edited_path, edited_thumb_path, reviewed_at")
    .eq("id", photoId)
    .eq("project_id", project.id)
    .maybeSingle<Pick<Row, "id" | "path" | "thumb_path" | "edited_path" | "edited_thumb_path" | "reviewed_at">>();
  if (!row) return "Photo not found.";

  let next: { edited_path: string | null; edited_thumb_path: string | null; lighting?: Group; look: string | null };
  if (choice) {
    const paths = editVersionPaths(project.organization_id, project.id, photoId, choice.version);
    const folder = paths.full.slice(0, paths.full.lastIndexOf("/"));
    const listed = await admin.storage.from(PROJECT_BUCKET).list(folder, { search: `${photoId}.edit.${choice.version}` });
    const names = new Set((listed.data ?? []).map((f) => f.name));
    const name = (p: string) => p.slice(p.lastIndexOf("/") + 1);
    if (!names.has(name(paths.full)) || !names.has(name(paths.thumb))) return "Upload didn't finish. Try again.";
    next = { edited_path: paths.full, edited_thumb_path: paths.thumb, lighting: choice.lighting, look: choice.look };
  } else {
    next = { edited_path: null, edited_thumb_path: null, look: null };
  }

  const { error } = await admin
    .from("project_photos")
    .update({ ...next, reviewed_at: row.reviewed_at ?? new Date().toISOString() })
    .eq("id", photoId)
    .eq("project_id", project.id);
  if (error) return "Couldn't save the edit. Try again.";

  const old = [row.edited_path, row.edited_thumb_path].filter((p): p is string => Boolean(p) && p !== next.edited_path && p !== next.edited_thumb_path);
  if (old.length) await admin.storage.from(PROJECT_BUCKET).remove(old);
  if (choice) await admin.rpc("record_look_picks", { p_org: project.organization_id, p_lighting: choice.lighting, p_look: choice.look, p_count: 1 });
  return null;
}

/** Marks photos reviewed (or not). Approving an auto-picked look counts as picking it. */
export async function markReviewed(admin: SupabaseClient, project: { id: string; organization_id: string }, photoIds: string[], reviewed: boolean): Promise<number> {
  const ids = photoIds.filter((id) => UUID_PATTERN.test(id)).slice(0, 500);
  if (!ids.length) return 0;
  const query = admin.from("project_photos").update({ reviewed_at: reviewed ? new Date().toISOString() : null }).eq("project_id", project.id).in("id", ids);
  // Only photos whose state changes (so approving twice doesn't count twice).
  const { data } = await (reviewed ? query.is("reviewed_at", null) : query.not("reviewed_at", "is", null)).select("lighting, look");
  if (reviewed) {
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { lighting: string | null; look: string | null }[]) {
      if (isGroup(r.lighting) && r.look) counts.set(`${r.lighting}|${r.look}`, (counts.get(`${r.lighting}|${r.look}`) ?? 0) + 1);
    }
    for (const [key, count] of counts) {
      const [lighting, look] = key.split("|");
      await admin.rpc("record_look_picks", { p_org: project.organization_id, p_lighting: lighting, p_look: look, p_count: count });
    }
  }
  return data?.length ?? 0;
}

const HEX16 = /^[0-9a-f]{16}$/;

/** A stored or submitted check, if it has the right shape and sane numbers. */
export function parseCheck(value: unknown): ShotCheck | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown, max: number) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max;
  const count = (x: unknown) => x === null || (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 50);
  if (!num(v.sharpness, 1e6) || !num(v.brightness, 1) || !num(v.clipped, 1) || !num(v.dark, 1)) return null;
  if (typeof v.dhash !== "string" || !HEX16.test(v.dhash) || !count(v.faces) || !count(v.eyesClosed)) return null;
  return {
    sharpness: v.sharpness as number,
    brightness: v.brightness as number,
    clipped: v.clipped as number,
    dark: v.dark as number,
    dhash: v.dhash,
    faces: (v.faces as number | null) ?? 0,
    eyesClosed: (v.eyesClosed as number | null) ?? 0,
  };
}

/** Saves checks for a few photos of a project. Returns how many were saved. */
export async function saveChecks(admin: SupabaseClient, projectId: string, checks: { photoId: string; check: unknown }[]): Promise<number> {
  let saved = 0;
  for (const { photoId, check } of checks.slice(0, 50)) {
    const parsed = UUID_PATTERN.test(photoId) ? parseCheck(check) : null;
    if (!parsed) continue;
    const { error } = await admin.from("project_photos").update({ quality: parsed, checked_at: new Date().toISOString() }).eq("id", photoId).eq("project_id", projectId);
    if (!error) saved++;
  }
  return saved;
}
