// Project photo storage paths and file rules, shared by the browser uploader,
// the server actions and the worker API.
import { UUID_PATTERN } from "@/lib/capture/photos";

export const PROJECT_BUCKET = "project-photos";

/**
 * Where a project photo's files live: "<studio>/<project>/<photo>.jpg" and
 * its thumbnail, plus the auto-edited pair (".edit.jpg", ".edit.thumb.jpg").
 */
export function projectPhotoPaths(organizationId: string, projectId: string, photoId: string) {
  for (const id of [organizationId, projectId, photoId]) {
    if (!UUID_PATTERN.test(id)) throw new Error("Invalid id in photo path");
  }
  const base = `${organizationId}/${projectId}/${photoId}`;
  return { full: `${base}.jpg`, thumb: `${base}.thumb.jpg`, editedFull: `${base}.edit.jpg`, editedThumb: `${base}.edit.thumb.jpg` };
}

/** A re-edit's files carry a version, so no cached copy of an older edit is shown. */
export const EDIT_VERSION_PATTERN = /^[a-z0-9]{8}$/;

export function newEditVersion(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Where a re-edit of a photo is stored: "<photo>.edit.<version>.jpg" and its thumbnail. */
export function editVersionPaths(organizationId: string, projectId: string, photoId: string, version: string) {
  if (!EDIT_VERSION_PATTERN.test(version)) throw new Error("Invalid edit version");
  const { full } = projectPhotoPaths(organizationId, projectId, photoId);
  const base = full.slice(0, -".jpg".length);
  return { full: `${base}.edit.${version}.jpg`, thumb: `${base}.edit.${version}.thumb.jpg` };
}

/** The five kinds of light the PC app tells apart. */
export const LIGHTING_GROUPS = ["daylight", "golden", "indoor", "stage", "night"] as const;
export type LightingGroup = (typeof LIGHTING_GROUPS)[number];
export const LIGHTING_LABELS: Record<LightingGroup, string> = {
  daylight: "Daylight",
  golden: "Golden hour",
  indoor: "Indoor warm",
  stage: "Stage / concert",
  night: "Night / flash",
};

export const LOOK_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "golden-glow" -> "Golden Glow", for display. */
export function lookName(lookId: string): string {
  const special: Record<string, string> = { "bright-airy": "Bright & Airy", "dark-rich": "Dark & Rich", "classic-bw": "Classic B&W" };
  return special[lookId] ?? lookId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Longest file name the database accepts. */
export const MAX_FILE_NAME = 255;

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

/**
 * Whether a file from a dropped folder is a photo worth uploading. Skips
 * hidden and system files (".DS_Store", "._IMG_0001.JPG", "Thumbs.db").
 */
export function isPhotoFile(name: string): boolean {
  const base = name.split("/").pop() ?? name;
  if (!base || base.startsWith(".")) return false;
  return IMAGE_EXTENSIONS.test(base);
}

/**
 * The name a photo is known by inside its project: its path inside the
 * dropped folder, minus the folder itself ("Ceremony/IMG_0001.JPG"). Two
 * files with the same name in different subfolders stay distinct.
 */
export function projectFileName(relativePath: string): string {
  const parts = relativePath.split("/").filter(Boolean);
  const inside = parts.length > 1 ? parts.slice(1) : parts;
  return inside.join("/").slice(-MAX_FILE_NAME);
}

/** True for HEIC/HEIF, which browsers can't decode; the PC app can. */
export function needsPcApp(name: string): boolean {
  return /\.(heic|heif)$/i.test(name);
}
