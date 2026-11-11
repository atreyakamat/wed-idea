// Project photo storage paths and file rules, shared by the browser uploader,
// the server actions and the worker API.
import { UUID_PATTERN } from "@/lib/capture/photos";

export const PROJECT_BUCKET = "project-photos";

/** Where a project photo's two files live: "<studio>/<project>/<photo>.jpg". */
export function projectPhotoPaths(organizationId: string, projectId: string, photoId: string) {
  for (const id of [organizationId, projectId, photoId]) {
    if (!UUID_PATTERN.test(id)) throw new Error("Invalid id in photo path");
  }
  const base = `${organizationId}/${projectId}/${photoId}`;
  return { full: `${base}.jpg`, thumb: `${base}.thumb.jpg` };
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
