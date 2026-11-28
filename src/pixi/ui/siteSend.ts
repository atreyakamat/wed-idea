import { STORABLE_PHOTO_TYPES, type CameraState } from "@/lib/camera/rules";
import { makeThumb, rollAll, type RollItem } from "./roll";

/**
 * "Send to studio" on the website: uploads the Roll's photos to a studio project through the
 * site's own /api/camera routes, signed in with the browser's session cookie. Nothing is sent
 * unless the person presses Send, and guests never reach these calls.
 */

export type SendTarget =
  | { kind: "existing"; projectId: string; projectName: string }
  | { kind: "new"; name: string };

export type SendResult = { ok: true; sent: number; skipped: number; project: string } | { ok: false; reason: string };

type PhotoLinks = { photoId: string; full: string; thumb: string };

export async function fetchCameraState(): Promise<CameraState> {
  const res = await fetch("/api/camera/session", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`The studio answered ${res.status}.`);
  return (await res.json()) as CameraState;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `The studio answered ${res.status}.`);
  return data;
}

async function dimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return null;
  }
}

async function put(url: string, blob: Blob, type: string): Promise<void> {
  const res = await fetch(url, { method: "PUT", body: blob, headers: { "Content-Type": type } });
  if (!res.ok) throw new Error("A photo didn't upload. Try again.");
}

/** A file name the studio can keep: the shot's id and a known extension. */
function fileNameFor(item: RollItem, type: string): string {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return `camera-${item.id.replace(/[^a-zA-Z0-9-]/g, "")}.${ext}`;
}

/** Sends every photo in the Roll to the target project, one photo at a time. */
export async function sendRollToStudio(target: SendTarget, onProgress: (done: number, total: number) => void, items?: RollItem[]): Promise<SendResult> {
  const photos = (items ?? (await rollAll())).filter((i) => i.kind === "photo");
  if (!photos.length) return { ok: false, reason: "The Roll has no photos to send." };
  try {
    const project = target.kind === "new"
      ? (await post<{ project: { id: string; name: string } }>("/api/camera/projects", { name: target.name })).project
      : { id: target.projectId, name: target.projectName };
    let sent = 0;
    let skipped = 0;
    for (const [i, item] of photos.entries()) {
      const type = item.blob.type;
      const size = (STORABLE_PHOTO_TYPES as readonly string[]).includes(type) ? await dimensions(item.blob) : null;
      const thumb = size ? (item.thumb ?? (await makeThumb(item.blob))) : undefined;
      if (!size || !thumb) {
        skipped++;
        onProgress(i + 1, photos.length);
        continue;
      }
      const links = await post<PhotoLinks>(`/api/camera/projects/${project.id}/uploads`, {});
      await put(links.full, item.blob, type);
      await put(links.thumb, thumb, "image/jpeg");
      await post(`/api/camera/projects/${project.id}/photos`, {
        photoId: links.photoId,
        fileName: fileNameFor(item, type),
        width: size.width,
        height: size.height,
        bytes: item.blob.size,
        takenAt: new Date(item.created).toISOString(),
      });
      sent++;
      onProgress(i + 1, photos.length);
    }
    return { ok: true, sent, skipped, project: project.name };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Sending didn't finish. Try again." };
  }
}
