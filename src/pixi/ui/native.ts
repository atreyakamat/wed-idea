import { Capacitor } from "@/pixi/native/capacitor-core";
import { Filesystem, Directory } from "@/pixi/native/capacitor-filesystem";
import { Share } from "@/pixi/native/capacitor-share";
import { Media } from "@/pixi/native/capacitor-media";
import { freeBytes, loadSaveTarget, writeToFolder } from "./saveTarget";

export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

/** Where a file ended up, or why it didn't. Callers must handle `ok: false` — saving is never assumed. */
export type SaveResult =
  | { ok: true; where: "gallery" | "files" | "folder" | "download"; folder?: string; saved?: number; failed?: number }
  | { ok: false; reason: string }
  /** The person closed the share sheet. Nothing was saved, and nothing went wrong. */
  | { ok: false; cancelled: true; reason: string };

export const wasCancelled = (r: SaveResult): boolean => !r.ok && "cancelled" in r && r.cancelled === true;

const ALBUM = "Pixi";
/** Base64 is handed to the native side in pieces: one 24 MB photo as a single string can exhaust the bridge. */
const CHUNK = 512 * 1024;

export function toBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error ?? new Error("Could not read the file"));
    r.readAsDataURL(blob);
  });
}

const safeName = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(0, 60);

/**
 * Platform share errors say "Share canceled" (both spellings appear across versions) when the person
 * simply closed the sheet. That is not a failure, and must never trigger a silent save.
 */
const isCancel = (e: unknown): boolean => {
  const m = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return /cancel/.test(m) || /abort/.test(m) || /dismiss/.test(m) || /user denied/.test(m);
};

const CANCELLED: SaveResult = { ok: false, cancelled: true, reason: "" };

/**
 * Writes a blob to a directory in pieces. The first piece creates the file, the rest append, so peak
 * memory is one chunk rather than the whole file encoded as text.
 */
async function writeChunked(
  blob: Blob,
  path: string,
  directory: Directory,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const total = blob.size;
  if (total <= CHUNK) {
    const f = await Filesystem.writeFile({ path, data: await toBase64(blob), directory, recursive: true });
    onProgress?.(1);
    return f.uri;
  }
  let offset = 0;
  let uri = "";
  let first = true;
  while (offset < total) {
    const piece = blob.slice(offset, Math.min(offset + CHUNK, total));
    const data = await toBase64(piece);
    if (first) {
      const f = await Filesystem.writeFile({ path, data, directory, recursive: true });
      uri = f.uri;
      first = false;
    } else {
      await Filesystem.appendFile({ path, data, directory });
    }
    offset += CHUNK;
    onProgress?.(Math.min(1, offset / total));
  }
  return uri;
}

/** Opens the system share sheet, which on every platform also offers "Save to Photos" or "Save to Files". */
export async function nativeShare(blob: Blob, name: string): Promise<void> {
  const uri = await writeChunked(blob, safeName(name), Directory.Cache);
  await Share.share({ files: [uri], dialogTitle: "Share or save" });
}

/**
 * The album identifier Android needs, looked up once and kept. Asking for the albums root and
 * appending our name avoids getAlbums(), which needs media-read permission the app does not require.
 */
let albumCache: { id: string | undefined } | null = null;

async function albumId(): Promise<string | undefined> {
  if (albumCache) return albumCache.id;
  const found = await lookupAlbum();
  albumCache = { id: found };
  return found;
}

async function lookupAlbum(): Promise<string | undefined> {
  const find = async () => {
    try {
      const { albums } = await Media.getAlbums();
      return albums.find((a) => a.name === ALBUM)?.identifier;
    } catch { return undefined; } // listing needs a permission we would rather not ask for
  };
  const first = await find();
  if (first) return first;
  try { await Media.createAlbum({ name: ALBUM }); } catch { /* already there, or not supported */ }
  const second = await find();
  if (second) return second;
  if (Capacitor.getPlatform() === "android") {
    try { const { path } = await Media.getAlbumsPath(); if (path) return `${path}/${ALBUM}`; } catch { /* no path */ }
  }
  return undefined;
}

/**
 * Android 9 and older need a storage permission before anything can be written to the public
 * library. Android 10 and newer grant writes to an app's own media for free, so nothing is asked.
 */
export async function ensureSavePermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const cur = await Filesystem.checkPermissions();
    if (cur.publicStorage === "granted") return true;
    const asked = await Filesystem.requestPermissions();
    return asked.publicStorage === "granted";
  } catch { return true; } // platforms that do not gate this at all
}

/**
 * Enough room for what is about to be written, with a margin. A phone that fills up mid-carousel
 * leaves half a post behind, so this is checked before the first file rather than after a failure.
 */
export async function hasRoomFor(bytes: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isNative()) return { ok: true };
  const free = await freeBytes();
  if (free < 0) return { ok: true }; // the platform will not say; the write itself will
  // A fifth over the payload: the gallery copy and the cache copy can both exist for a moment.
  if (free < bytes * 1.2) {
    const mb = Math.ceil((bytes * 1.2 - free) / (1024 * 1024));
    return { ok: false, reason: `Your phone needs about ${mb} MB more space for this. Free some up and try again.` };
  }
  return { ok: true };
}

/** Saves into the phone's photo library, or into the folder the person chose. */
export async function saveToGallery(
  blob: Blob,
  name: string,
  kind: "photo" | "video",
  onProgress?: (fraction: number) => void,
): Promise<SaveResult> {
  if (!isNative()) return downloadInBrowser(blob, name);

  const target = loadSaveTarget();
  if (target) {
    const r = await saveToFolder(blob, name, target, onProgress);
    if (r.ok) return r;
    // The chosen folder may have been deleted or had its permission revoked. Fall through to the gallery.
  }

  await ensureSavePermission();
  const base = safeName(name).replace(/\.[^.]+$/, "");
  const id = await albumId();
  try {
    if (kind === "photo") {
      const data = await toBase64(blob);
      await Media.savePhoto({ path: `data:${blob.type || "image/jpeg"};base64,${data}`, albumIdentifier: id, fileName: base });
    } else {
      const tmp = await writeChunked(blob, safeName(name), Directory.Cache, onProgress);
      await Media.saveVideo({ path: tmp, albumIdentifier: id, fileName: base });
    }
    onProgress?.(1);
    return { ok: true, where: "gallery" };
  } catch (e) {
    // Scoped storage blocks some devices from the public library. Documents still works there.
    try {
      await writeChunked(blob, `${ALBUM}/${safeName(name)}`, Directory.Documents, onProgress);
      return { ok: true, where: "files" };
    } catch {
      return { ok: false, reason: plainSaveError(e) };
    }
  }
}

/** Writes into a folder the person picked themselves, through the save-target plugin. */
async function saveToFolder(
  blob: Blob,
  name: string,
  target: { uri: string; label: string },
  onProgress?: (fraction: number) => void,
): Promise<SaveResult> {
  try {
    const okay = await writeToFolder(target.uri, safeName(name), blob, blob.type || "image/jpeg", onProgress);
    if (okay) return { ok: true, where: "folder", folder: target.label };
    return { ok: false, reason: `Pixi could not write to ${target.label}. Pick the folder again in Settings.` };
  } catch (e) {
    return { ok: false, reason: plainSaveError(e) };
  }
}

/** Browser fallback: hand the file to the browser's own download. */
export function downloadInBrowser(blob: Blob, name: string): SaveResult {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = safeName(name); a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return { ok: true, where: "download" };
  } catch {
    return { ok: false, reason: "Your browser blocked the download. Tap Share to save it instead." };
  }
}

/** Shares several files at once: a whole carousel goes to Instagram in one go. */
export async function shareFiles(blobs: Blob[], baseName: string, extension: string): Promise<SaveResult> {
  if (!blobs.length) return { ok: false, reason: "Nothing to share" };
  if (blobs.length === 1) return shareOrSave(blobs[0], `${baseName}.${extension}`);
  if (isNative()) {
    let uris: string[];
    try {
      uris = [];
      for (let i = 0; i < blobs.length; i++) {
        uris.push(await writeChunked(blobs[i], safeName(`${baseName}-${i + 1}.${extension}`), Directory.Cache));
      }
    } catch (e) {
      return { ok: false, reason: plainSaveError(e) };
    }
    try {
      await Share.share({ files: uris, dialogTitle: "Share or save" });
      return { ok: true, where: "gallery" };
    } catch (e) {
      // Closing the sheet must never save anything behind the person's back.
      if (isCancel(e)) return CANCELLED;
      return saveAll(blobs, baseName, extension);
    }
  }
  const files = blobs.map((b, i) => new File([b], safeName(`${baseName}-${i + 1}.${extension}`), { type: b.type || "image/jpeg" }));
  try {
    if (navigator.canShare?.({ files })) { await navigator.share({ files }); return { ok: true, where: "gallery" }; }
  } catch (e) {
    if (isCancel(e)) return CANCELLED;
  }
  return saveAll(blobs, baseName, extension);
}

/**
 * Writes every page of a carousel. Reports how many landed, so a half-finished set is never called
 * a success: "saved 18 of 20" is the truth the person needs to retry the rest.
 */
export async function saveAll(
  blobs: Blob[],
  baseName: string,
  extension: string,
  onProgress?: (done: number, total: number) => void,
): Promise<SaveResult> {
  if (!blobs.length) return { ok: false, reason: "Nothing to save" };
  const room = await hasRoomFor(blobs.reduce((n, b) => n + b.size, 0));
  if (!room.ok) return room;

  let saved = 0;
  let where: "gallery" | "files" | "folder" | "download" = "gallery";
  let folder: string | undefined;
  let firstError = "";
  for (let i = 0; i < blobs.length; i++) {
    const r = await saveToGallery(blobs[i], `${baseName}-${i + 1}.${extension}`, "photo");
    if (r.ok) { saved++; where = r.where; folder = r.folder ?? folder; }
    else if (!firstError) firstError = r.reason;
    onProgress?.(i + 1, blobs.length);
  }
  if (saved === blobs.length) return { ok: true, where, folder, saved };
  if (saved === 0) return { ok: false, reason: firstError || "Your phone didn't let Pixi save those." };
  return { ok: true, where, folder, saved, failed: blobs.length - saved };
}

/** Share where the platform supports it, otherwise fall back to saving. */
export async function shareOrSave(blob: Blob, name: string): Promise<SaveResult> {
  if (isNative()) {
    try { await nativeShare(blob, name); return { ok: true, where: "gallery" }; }
    catch (e) {
      if (isCancel(e)) return CANCELLED;
      return saveToGallery(blob, name, blob.type.startsWith("video") ? "video" : "photo");
    }
  }
  const file = new File([blob], safeName(name), { type: blob.type || "image/jpeg" });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return { ok: true, where: "gallery" }; }
  } catch (e) {
    if (isCancel(e)) return CANCELLED;
  }
  return downloadInBrowser(blob, name);
}

/**
 * Platform errors arrive as things like "java.lang.SecurityException: ..." — true, but useless to a
 * person. This keeps the detail in the console and gives them what happened and what to do.
 */
export function plainSaveError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? "");
  if (m) console.warn("[pixi] save failed:", m);
  if (/permission|denied|security|not allowed/i.test(m)) return "Pixi isn't allowed to save photos. Allow Photos for Pixi in your phone's Settings, or tap Share.";
  if (/space|quota|full|ENOSPC/i.test(m)) return "Your phone is out of space. Free some up, or tap Share to save it somewhere else.";
  return "Your phone didn't let Pixi save that. Tap Share to save it another way.";
}

export function saveMessage(r: SaveResult): string {
  if (!r.ok) return r.reason;
  const many = r.saved && r.saved > 1 ? `${r.saved} pages ` : "";
  const place = r.where === "folder" ? `to ${r.folder}` : r.where === "gallery" ? "to your gallery" : r.where === "files" ? "to Documents/Pixi" : "";
  const head = r.where === "download" ? "Downloaded" : `Saved ${many}${place}`.trim();
  return r.failed ? `${head} — ${r.failed} didn't save` : head;
}

/**
 * A file that is not a photo (a backup zip, say): written to the chosen folder or Documents/Pixi on
 * the phone and offered to the share sheet, or downloaded in a browser.
 */
export async function exportDocument(blob: Blob, name: string): Promise<SaveResult> {
  if (!isNative()) return downloadInBrowser(blob, name);
  const target = loadSaveTarget();
  if (target) {
    const r = await saveToFolder(blob, name, target);
    if (r.ok) return r;
  }
  try {
    const uri = await writeChunked(blob, `${ALBUM}/${safeName(name)}`, Directory.Documents);
    try { await Share.share({ files: [uri], dialogTitle: "Share or save" }); } catch { /* person closed the sheet; the file is still in Documents */ }
    return { ok: true, where: "files" };
  } catch (e) {
    return { ok: false, reason: plainSaveError(e) };
  }
}

/** A link or a line of text to the share sheet; copied to the clipboard where there is no share sheet. */
export async function shareText(text: string, title = "Pixi"): Promise<"shared" | "copied" | "failed"> {
  try {
    if (isNative()) { await Share.share({ text, title, dialogTitle: title }); return "shared"; }
    if (navigator.share) { await navigator.share({ text, title }); return "shared"; }
  } catch (e) {
    if (isCancel(e)) return "shared"; // the person closed the sheet
  }
  try { await navigator.clipboard.writeText(text); return "copied"; } catch { return "failed"; }
}
