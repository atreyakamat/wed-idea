import { unzip, zip, type Unzipped } from "fflate";
import { rollAll, rollImportMany, type RollItem } from "./roll";
import { sniffBytes } from "./media";

/**
 * Asks the browser to treat Pixi's storage as persistent so the roll is not evicted under
 * storage pressure. Returns true when the request was granted (or was already in force).
 * Capacitor's WebView usually grants this without a prompt; mobile Safari may not.
 */
export async function keepStorage(): Promise<boolean> {
  try {
    const st = navigator.storage;
    if (!st?.persist) return false;
    if (await st.persisted?.()) return true;
    return await st.persist();
  } catch { return false; }
}

export async function storageEstimate(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch { return null; }
}

interface Manifest {
  app: "pixi"; version: 1; made: number;
  items: { id: string; file: string; kind: RollItem["kind"]; ext: string; created: number; camera?: string; look?: string; film?: string; geo?: { lat: number; lon: number }; liked?: boolean }[];
}

const MAX_ITEMS = 5000;
const MAX_FILE = 64 * 1024 * 1024; // one shot, bytes
const SAFE_EXT = /^(jpg|jpeg|png|webp|mp4|webm)$/;
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" };

/** The whole roll as one zip: originals plus a small manifest. Already-compressed media is stored, not deflated. */
export async function backupRoll(onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const items = await rollAll();
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  const manifest: Manifest = { app: "pixi", version: 1, made: Date.now(), items: [] };
  let n = 0;
  for (const it of items) {
    const ext = SAFE_EXT.test(it.ext) ? it.ext : "jpg";
    const file = `shots/${it.id}.${ext}`;
    files[file] = [new Uint8Array(await it.blob.arrayBuffer()), { level: 0 }];
    manifest.items.push({ id: it.id, file, kind: it.kind, ext, created: it.created, camera: it.camera, look: it.look, film: it.film, geo: it.geo, liked: it.liked });
    onProgress?.(++n, items.length);
  }
  const bytes = await new Promise<Uint8Array>((res, rej) => zip({ ...files, "pixi.json": [new TextEncoder().encode(JSON.stringify(manifest)), { level: 6 }] }, (e, d) => (e ? rej(e) : res(d))));
  return new Blob([bytes as BlobPart], { type: "application/zip" });
}

export interface RestoreResult { added: number; skipped: number; reason?: string }

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
const idOk = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);

/**
 * Restores a backup. Every entry is treated as untrusted: paths, ids, extensions and sizes are
 * validated, bytes are sniffed for a real image or video header, and existing ids are left alone.
 */
export async function restoreRoll(file: Blob, onProgress?: (done: number, total: number) => void): Promise<RestoreResult> {
  if (file.size > 2 * 1024 * 1024 * 1024) return { added: 0, skipped: 0, reason: "That backup is over 2 GB, which is more than Pixi can open." };
  let entries: Unzipped;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    entries = await new Promise((res, rej) => unzip(buf, { filter: (f) => f.originalSize <= MAX_FILE }, (e, d) => (e ? rej(e) : res(d))));
  } catch { return { added: 0, skipped: 0, reason: "That isn't a Pixi backup. Pick the .zip Pixi made." }; }
  const raw = entries["pixi.json"];
  if (!raw) return { added: 0, skipped: 0, reason: "That isn't a Pixi backup. Pick the .zip Pixi made." };
  let m: Partial<Manifest>;
  try { m = JSON.parse(new TextDecoder().decode(raw)); } catch { return { added: 0, skipped: 0, reason: "That backup is damaged. Try another copy." }; }
  if (m.app !== "pixi" || !Array.isArray(m.items)) return { added: 0, skipped: 0, reason: "That isn't a Pixi backup. Pick the .zip Pixi made." };

  const items: RollItem[] = [];
  let skipped = 0;
  const list = m.items.slice(0, MAX_ITEMS);
  for (let i = 0; i < list.length; i++) {
    const e = list[i] as Partial<Manifest["items"][number]>;
    const ext = str(e.ext, 5)?.toLowerCase() ?? "";
    const path = str(e.file, 128) ?? "";
    const bytes = entries[path];
    if (!idOk(e.id) || !SAFE_EXT.test(ext) || !path.startsWith("shots/") || path.includes("..") || !bytes || sniffBytes(bytes) !== (ext === "jpeg" ? "jpg" : ext)) { skipped++; continue; }
    const kind: RollItem["kind"] = e.kind === "video" ? "video" : "photo";
    const created = typeof e.created === "number" && Number.isFinite(e.created) ? Math.min(Math.max(e.created, 0), Date.now() + 86400000) : Date.now();
    const geo = e.geo && Number.isFinite(e.geo.lat) && Number.isFinite(e.geo.lon) ? { lat: e.geo.lat, lon: e.geo.lon } : undefined;
    items.push({
      id: e.id, kind, ext, blob: new Blob([bytes as BlobPart], { type: MIME[ext] }), created,
      camera: str(e.camera, 64) ?? undefined, look: str(e.look, 64) ?? undefined, film: str(e.film, 64) ?? undefined, geo, liked: e.liked === true,
    });
    onProgress?.(i + 1, list.length);
  }
  const added = await rollImportMany(items);
  return { added, skipped: skipped + (items.length - added) };
}
