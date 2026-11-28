import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { saveToGallery, type SaveResult } from "./native";

export interface RollItem {
  id: string;
  kind: "photo" | "video";
  ext: string;
  blob: Blob;
  /** Small JPEG of the frame, so the grid never has to hold full-size images in memory. */
  thumb?: Blob;
  created: number;
  camera?: string;
  /** The look (filter) that was live when this was shot. */
  look?: string;
  /** The film stock that was loaded, if any. */
  film?: string;
  /** A rough, one-shot fix taken at capture time. Never a map, never sent anywhere. */
  geo?: { lat: number; lon: number };
  /** True once the file has also been written to the phone's gallery. */
  exported?: boolean;
  /** Hearted in the viewer. Purely local — nothing is shared by liking a shot. */
  liked?: boolean;
}

/** A deleted shot, kept for a while so one mis-tap is not the end of it. */
export interface TrashItem extends RollItem { binned: number }

interface Schema extends DBSchema {
  roll: { key: string; value: RollItem; indexes: { created: number } };
  trash: { key: string; value: TrashItem; indexes: { binned: number } };
}

/** How long a deleted shot stays recoverable. */
export const TRASH_DAYS = 30;

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
const db = () => (dbp ??= openDB<Schema>("pixi", 2, {
  upgrade(d, from) {
    if (from < 1) d.createObjectStore("roll", { keyPath: "id" }).createIndex("created", "created");
    if (from < 2) d.createObjectStore("trash", { keyPath: "id" }).createIndex("binned", "binned");
  },
}));

/** Builds a small preview so the Roll grid stays light however many shots are stored. */
export async function makeThumb(blob: Blob, max = 320): Promise<Blob | undefined> {
  let bmp: ImageBitmap | undefined;
  try {
    bmp = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    return await new Promise((res) => c.toBlob((b) => res(b ?? undefined), "image/jpeg", 0.75));
  } catch { return undefined; }
  finally { bmp?.close(); }
}

export async function rollAll(): Promise<RollItem[]> {
  try { return (await (await db()).getAllFromIndex("roll", "created")).reverse(); } catch { return []; }
}

export async function rollGet(id: string): Promise<RollItem | undefined> {
  try { return await (await db()).get("roll", id); } catch { return undefined; }
}

/** Drops the oldest shots once the roll passes the person's limit, so storage cannot grow without end. */
async function trim(limit: number) {
  try {
    const d = await db();
    const keys = await d.getAllKeysFromIndex("roll", "created");
    if (keys.length <= limit) return;
    const tx = d.transaction("roll", "readwrite");
    await Promise.all([...keys.slice(0, keys.length - limit).map((k) => tx.store.delete(k)), tx.done]);
  } catch { /* nothing we can do about a full or blocked store */ }
}

export interface AddResult { stored: boolean; save?: SaveResult }

/**
 * Keeps a shot in Pixi and, when the person has asked for it, writes a copy to the phone gallery.
 * Never throws: a full disk must not lose the photo that is already on screen.
 */
export async function rollAdd(item: RollItem, opts: { autoSave: boolean; limit: number }): Promise<AddResult> {
  const thumb = item.thumb ?? (item.kind === "photo" ? await makeThumb(item.blob) : undefined);
  let save: SaveResult | undefined;
  if (opts.autoSave) {
    save = await saveToGallery(item.blob, `pixi-${item.created}.${item.ext}`, item.kind);
  }
  let stored = false;
  try {
    await (await db()).put("roll", { ...item, thumb, exported: save?.ok === true });
    stored = true;
    void trim(opts.limit);
  } catch { /* quota or private mode */ }
  return { stored, save };
}

export async function markExported(id: string) {
  try {
    const d = await db();
    const cur = await d.get("roll", id);
    if (cur) await d.put("roll", { ...cur, exported: true });
  } catch { /* ignore */ }
}

export async function rollLike(id: string, liked: boolean): Promise<void> {
  try {
    const d = await db();
    const cur = await d.get("roll", id);
    if (cur) await d.put("roll", { ...cur, liked });
  } catch { /* ignore */ }
}

/** Patches in a location fix that arrived after the shot was already saved. */
export async function rollGeoTag(id: string, geo: { lat: number; lon: number }): Promise<void> {
  try {
    const d = await db();
    const cur = await d.get("roll", id);
    if (cur) await d.put("roll", { ...cur, geo });
  } catch { /* ignore */ }
}

/**
 * Moves a shot to the bin rather than destroying it. Thirty days later it goes for good, which is
 * swept up here rather than on a timer, so closing the app never leaves work half done.
 */
export async function rollDelete(id: string): Promise<void> {
  try {
    const d = await db();
    const cur = await d.get("roll", id);
    if (cur) await d.put("trash", { ...cur, binned: Date.now() });
    await d.delete("roll", id);
    void purgeOldTrash();
  } catch { /* ignore */ }
}

export async function trashAll(): Promise<TrashItem[]> {
  try { return (await (await db()).getAllFromIndex("trash", "binned")).reverse(); } catch { return []; }
}

/** Puts a binned shot back in the roll, where it keeps its original date. */
export async function trashRestore(id: string): Promise<RollItem | undefined> {
  try {
    const d = await db();
    const cur = await d.get("trash", id);
    if (!cur) return undefined;
    const item = { ...cur }; delete (item as Partial<typeof cur>).binned;
    await d.put("roll", item);
    await d.delete("trash", id);
    return item;
  } catch { return undefined; }
}

export async function trashDrop(id: string): Promise<void> {
  try { await (await db()).delete("trash", id); } catch { /* ignore */ }
}

export async function trashEmpty(): Promise<void> {
  try { await (await db()).clear("trash"); } catch { /* ignore */ }
}

async function purgeOldTrash() {
  try {
    const d = await db();
    const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
    const old = await d.getAllKeysFromIndex("trash", "binned", IDBKeyRange.upperBound(cutoff));
    const tx = d.transaction("trash", "readwrite");
    await Promise.all([...old.map((k) => tx.store.delete(k)), tx.done]);
  } catch { /* ignore */ }
}

/** Rough number of bytes the roll is holding, for the Settings screen. */
export async function rollSize(): Promise<{ count: number; bytes: number }> {
  try {
    const all = await (await db()).getAll("roll");
    return { count: all.length, bytes: all.reduce((n, i) => n + i.blob.size + (i.thumb?.size ?? 0), 0) };
  } catch { return { count: 0, bytes: 0 }; }
}

export async function rollClear(): Promise<void> {
  try { const d = await db(); await d.clear("roll"); await d.clear("trash"); } catch { /* ignore */ }
}

/** Adds shots from a backup. Ids already in the roll are left as they are; returns how many landed. */
export async function rollImportMany(items: RollItem[]): Promise<number> {
  let n = 0;
  try {
    const d = await db();
    for (const it of items) {
      if (await d.getKey("roll", it.id)) continue;
      const thumb = it.kind === "photo" ? await makeThumb(it.blob) : undefined;
      await d.put("roll", { ...it, thumb, exported: false });
      n++;
    }
  } catch { /* quota */ }
  return n;
}
