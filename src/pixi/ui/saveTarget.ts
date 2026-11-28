import { Capacitor, registerPlugin } from "@/pixi/native/capacitor-core";

/**
 * Where the person wants their photos to land. Android only: it wraps the system folder chooser,
 * which grants access to that one folder and nothing more. Without a choice, Pixi keeps using the
 * gallery album, so this is an option rather than a step everyone has to take.
 */
export interface SaveTarget {
  /** The opaque tree uri the platform gave us. Never shown to the person. */
  uri: string;
  /** Something they recognise, such as "DCIM/Pixi". */
  label: string;
}

interface SaveTargetPlugin {
  pickFolder(): Promise<{ cancelled: boolean; uri?: string; label?: string }>;
  writeFile(o: { uri: string; name: string; data: string; mimeType?: string; append?: boolean; fileUri?: string }): Promise<{ fileUri: string }>;
  checkFolder(o: { uri: string }): Promise<{ usable: boolean }>;
  freeSpace(): Promise<{ bytes: number }>;
}

const Plugin = registerPlugin<SaveTargetPlugin>("SaveTarget");

const KEY = "pixi:savetarget:v1";
const CHUNK = 512 * 1024;

/** The folder picker exists on Android only; everywhere else saving goes to the gallery or downloads. */
export const canPickFolder = () =>
  typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export function loadSaveTarget(): SaveTarget | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SaveTarget>;
    if (typeof v.uri !== "string" || !v.uri) return null;
    return { uri: v.uri, label: typeof v.label === "string" && v.label ? v.label : "your folder" };
  } catch { return null; }
}

export function saveSaveTarget(t: SaveTarget | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
}

/** Opens the system folder chooser. Returns null when the person backs out. */
export async function pickFolder(): Promise<SaveTarget | null> {
  if (!canPickFolder()) return null;
  const r = await Plugin.pickFolder();
  if (r.cancelled || !r.uri) return null;
  const t: SaveTarget = { uri: r.uri, label: r.label || "your folder" };
  saveSaveTarget(t);
  return t;
}

/** False once the folder has been deleted or its permission withdrawn, so Pixi can say so plainly. */
export async function folderStillWorks(uri: string): Promise<boolean> {
  if (!canPickFolder()) return false;
  try { return (await Plugin.checkFolder({ uri })).usable; } catch { return false; }
}

const base64 = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error ?? new Error("Could not read the file"));
    r.readAsDataURL(blob);
  });

/** Writes a blob into the chosen folder in pieces, so one big file never crosses the bridge at once. */
export async function writeToFolder(
  uri: string,
  name: string,
  blob: Blob,
  mimeType: string,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  if (!canPickFolder()) return false;
  const total = blob.size;
  if (total <= CHUNK) {
    await Plugin.writeFile({ uri, name, data: await base64(blob), mimeType });
    onProgress?.(1);
    return true;
  }
  let offset = 0;
  let fileUri = "";
  while (offset < total) {
    const piece = blob.slice(offset, Math.min(offset + CHUNK, total));
    const data = await base64(piece);
    const r = await Plugin.writeFile(
      offset === 0
        ? { uri, name, data, mimeType }
        : { uri, name, data, mimeType, append: true, fileUri },
    );
    fileUri = r.fileUri || fileUri;
    offset += CHUNK;
    onProgress?.(Math.min(1, offset / total));
  }
  return true;
}

/** Free bytes on the phone, or -1 where the platform will not say. */
export async function freeBytes(): Promise<number> {
  if (!canPickFolder()) return -1;
  try { return (await Plugin.freeSpace()).bytes; } catch { return -1; }
}
