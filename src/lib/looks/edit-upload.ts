// Renders a photo with a look at full size and uploads the edited pair.
import { FULL_LONG_EDGE, THUMB_LONG_EDGE } from "@/lib/capture/photos";
import { editVersionPaths, newEditVersion, PROJECT_BUCKET, projectPhotoPaths } from "@/lib/projects/paths";
import { createClient } from "@/lib/supabase/client";
import { decode, encodeJpeg, planPhoto, renderLook, type Pixels } from "./client";
import type { Group } from "./data";
import type { StylePrefs } from "./engine";

const UPLOAD = { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" };
export const EDIT_FULL_QUALITY = 0.88;
export const EDIT_THUMB_QUALITY = 0.8;

export type EditedPair = { full: Blob; thumb: Blob; group: Group; lookId: string; tone: string | null };

/** Auto-edits a photo: measures its light, picks a look (or uses the given one) and renders both sizes. */
export async function editPixels(pixels: Pixels, seed: string, options: { group?: Group; lookId?: string; style?: StylePrefs } = {}): Promise<EditedPair> {
  const plan = await planPhoto(pixels, options);
  const strength = options.lookId ? 1 : plan.strength;
  const edited = await renderLook(pixels, plan.features, plan.group, plan.lookId, strength, seed);
  const [full, thumb] = await Promise.all([encodeJpeg(edited, FULL_LONG_EDGE, EDIT_FULL_QUALITY), encodeJpeg(edited, THUMB_LONG_EDGE, EDIT_THUMB_QUALITY)]);
  return { full, thumb, group: plan.group, lookId: plan.lookId, tone: averageHex(edited) };
}

/** Average colour of rendered pixels, "#rrggbb". */
function averageHex(p: Pixels): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const step = Math.max(1, Math.floor((p.width * p.height) / 4096)) * 4;
  for (let i = 0; i < p.rgba.length; i += step) {
    r += p.rgba[i];
    g += p.rgba[i + 1];
    b += p.rgba[i + 2];
    n++;
  }
  if (!n) return null;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Re-edits a stored photo from its plain copy with a chosen look and uploads
 * the result as a new version. Returns the version to save.
 */
export async function reEditAndUpload(
  ids: { organizationId: string; projectId: string; photoId: string },
  plainFullUrl: string,
  group: Group,
  lookId: string,
): Promise<string> {
  const res = await fetch(plainFullUrl);
  if (!res.ok) throw new Error("Couldn't load the photo.");
  const pixels = await decode(await res.blob(), FULL_LONG_EDGE);
  const pair = await editPixels(pixels, ids.photoId, { group, lookId });
  const version = newEditVersion();
  const paths = editVersionPaths(ids.organizationId, ids.projectId, ids.photoId, version);
  const bucket = createClient().storage.from(PROJECT_BUCKET);
  const [a, b] = await Promise.all([bucket.upload(paths.full, pair.full, UPLOAD), bucket.upload(paths.thumb, pair.thumb, UPLOAD)]);
  if (a.error || b.error) throw new Error("Upload failed. Check the connection.");
  return version;
}

/** The edited pair's storage paths for a new upload (the first edit has no version). */
export function firstEditPaths(organizationId: string, projectId: string, photoId: string) {
  const p = projectPhotoPaths(organizationId, projectId, photoId);
  return { full: p.editedFull, thumb: p.editedThumb };
}
