/**
 * A Pixi profile. There is no account and no server: the profile is kept on this phone, and to
 * share it the public part (name, handle, bio, featured looks) is packed into a short code that
 * rides in a link's fragment or a QR code. Fragments are never sent to a web server, so even the
 * host of the landing page never sees whose profile was opened.
 */
import { packText, sanitizeLook, unpackText, type SavedLook } from "./store";

export interface Profile {
  name: string;
  handle: string;
  bio: string;
  /** A small square JPEG as a data URL. Stays on the phone; it appears on the card image, not in the link. */
  avatar: string | null;
  /** Up to three looks to show off. Ids of built-in looks or of the person's own. */
  lookIds: string[];
  /** Up to six roll photos for the card image. */
  photoIds: string[];
}

export const MAX_LOOKS = 3, MAX_PHOTOS = 6;
export const EMPTY_PROFILE: Profile = { name: "", handle: "", bio: "", avatar: null, lookIds: [], photoIds: [] };
const KEY = "pixi:profile:v1";

const cap = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, n) : "");
/** Handles are lowercase letters, digits, dot and underscore: what every social app accepts. */
export const cleanHandle = (v: unknown) => cap(v, 40).toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._]/g, "").slice(0, 24);
const ids = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 64).slice(0, n) : []);

export function loadProfile(): Profile {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Profile>;
    const avatar = typeof v.avatar === "string" && v.avatar.startsWith("data:image/jpeg;base64,") && v.avatar.length < 200_000 ? v.avatar : null;
    return { name: cap(v.name, 40), handle: cleanHandle(v.handle), bio: cap(v.bio, 90), avatar, lookIds: ids(v.lookIds, MAX_LOOKS), photoIds: ids(v.photoIds, MAX_PHOTOS) };
  } catch { return { ...EMPTY_PROFILE }; }
}
export function persistProfile(p: Profile) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full */ } }
export const hasProfile = (p: Profile) => !!(p.name.trim() || p.handle);

/** A square avatar from any photo: centre-cropped, 256 px, small enough to live in settings storage. */
export async function makeAvatar(blob: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const side = Math.min(bmp.width, bmp.height);
    const c = document.createElement("canvas"); c.width = c.height = 256;
    c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
    bmp.close();
    return c.toDataURL("image/jpeg", 0.82);
  } catch { return null; }
}

/* ---------- sharing: PIXIU1.<base64url(deflate(json))> ---------- */

/** What travels in a link: either the id of a built-in look, or a whole custom look. */
export type SharedLook = { builtin: string } | { look: SavedLook };
export interface SharedProfile { name: string; handle: string; bio: string; looks: SharedLook[] }

export async function encodeProfile(p: Profile, mine: SavedLook[], isBuiltin: (id: string) => boolean): Promise<string> {
  const k = p.lookIds.slice(0, MAX_LOOKS).map((id) => {
    const l = mine.find((x) => x.id === id);
    if (l) return { n: l.name, b: l.blurb, l: l.layers, o: l.overlays, a: l.aspect };
    return isBuiltin(id) ? id : null;
  }).filter((x) => x !== null);
  return packText("PIXIU", JSON.stringify({ v: 1, n: p.name.trim(), h: p.handle, b: p.bio.trim(), k }));
}

/** Untrusted input: everything is length-capped, handles are re-cleaned, custom looks go through the look sanitiser. */
export async function decodeProfile(code: string, isBuiltin: (id: string) => boolean): Promise<SharedProfile | null> {
  const text = await unpackText("PIXIU", code);
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { n?: unknown; h?: unknown; b?: unknown; k?: unknown };
    const looks: SharedLook[] = [];
    for (const it of (Array.isArray(raw.k) ? raw.k : []).slice(0, MAX_LOOKS)) {
      if (typeof it === "string") { if (isBuiltin(it)) looks.push({ builtin: it }); }
      else if (it && typeof it === "object") { const l = sanitizeLook(it as Record<string, unknown>); if (l) looks.push({ look: l }); }
    }
    const out = { name: cap(raw.n, 40).trim(), handle: cleanHandle(raw.h), bio: cap(raw.b, 90).trim(), looks };
    return out.name || out.handle || looks.length ? out : null;
  } catch { return null; }
}

/** Pulls a profile code out of whatever was scanned or pasted: a bare code, or a link carrying one. */
export function profileCodeFrom(text: string): string | null {
  const m = /PIXIU[01]\.[A-Za-z0-9_-]+/.exec(text.trim());
  return m ? m[0] : null;
}

/**
 * Where profile links point. On the web that is wherever Pixi is hosted. Inside the Android app
 * there is no public address unless one was set at build time (NEXT_PUBLIC_PIXI_SITE), in which
 * case sharing falls back to the QR code and the card image.
 */
export function siteOrigin(): string | null {
  const set = process.env.NEXT_PUBLIC_PIXI_SITE;
  if (set && /^https:\/\//.test(set)) return set.replace(/\/+$/, "");
  if (typeof location === "undefined") return null;
  return location.protocol === "https:" && location.hostname !== "localhost" ? location.origin : location.hostname === "localhost" && location.port ? location.origin : null;
}
export const profileLink = (code: string, origin: string) => `${origin}/u/#p=${code}`;
