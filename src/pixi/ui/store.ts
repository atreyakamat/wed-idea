import { GPU_KINDS, LAYER_DEFS } from "@/pixi/engine/layerDefs";
import type { LayerSpec, OverlaySpec, Preset } from "@/pixi/engine/types";

export interface SavedLook {
  id: string;
  name: string;
  blurb: string;
  layers: LayerSpec[];
  overlays: OverlaySpec[];
  aspect?: number;
  created: number;
}

const KEY = "pixi:looks:v1";
const FAV = "pixi:favs:v1";
const MAX_LAYERS = 24;

export const newId = () => "my-" + Math.random().toString(36).slice(2, 9);

export function loadLooks(): SavedLook[] {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedLook[]).filter((l) => l && Array.isArray(l.layers)); } catch { return []; }
}
export function persistLooks(list: SavedLook[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full */ } }
export function loadFavs(): string[] { try { return JSON.parse(localStorage.getItem(FAV) ?? "[]"); } catch { return []; } }
export function persistFavs(f: string[]) { try { localStorage.setItem(FAV, JSON.stringify(f)); } catch { /* ignore */ } }

export const lookToPreset = (l: SavedLook): Preset => ({
  id: l.id, name: l.name, family: "My Looks", blurb: l.blurb || "Your own look.", layers: l.layers, overlays: l.overlays, aspect: l.aspect,
});

export const presetToLook = (p: Preset, name?: string): SavedLook => ({
  id: newId(), name: name ?? `${p.name} copy`, blurb: p.blurb, layers: JSON.parse(JSON.stringify(p.layers)), overlays: JSON.parse(JSON.stringify(p.overlays ?? [])), aspect: p.aspect, created: Date.now(),
});

/* ---------- share codes: PIXI1.<base64url(deflate(json))> ---------- */

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeLook(l: SavedLook): Promise<string> {
  const json = JSON.stringify({ n: l.name, b: l.blurb, l: l.layers, o: l.overlays, a: l.aspect });
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream === "undefined") return "PIXI0." + b64u(raw);
  return "PIXI1." + b64u(await pipe(raw, new CompressionStream("deflate-raw")));
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Untrusted input: only known layer kinds, every parameter clamped to its declared range. */
export function sanitizeLook(raw: { n?: unknown; b?: unknown; l?: unknown; o?: unknown; a?: unknown }): SavedLook | null {
  if (!Array.isArray(raw.l)) return null;
  const layers: LayerSpec[] = [];
  for (const it of raw.l.slice(0, MAX_LAYERS)) {
    const kind = (it as LayerSpec)?.kind;
    if (!GPU_KINDS.includes(kind)) continue;
    const defs = LAYER_DEFS[kind].params;
    const params: Record<string, number> = {};
    for (const d of defs) {
      const v = (it as LayerSpec).params?.[d.key];
      if (v !== undefined) params[d.key] = num(v, d.min, d.max, d.def);
    }
    layers.push({ kind, params, enabled: (it as LayerSpec).enabled !== false });
  }
  if (!layers.length) return null;
  const overlays: OverlaySpec[] = [];
  if (Array.isArray(raw.o)) {
    for (const o of raw.o.slice(0, 4) as Record<string, unknown>[]) {
      if (o?.kind === "stamp" && ["seg7", "dot", "sans", "mono", "vcr"].includes(o.style as string)) {
        overlays.push({ kind: "stamp", style: o.style as "seg7", format: str(o.format, 40), color: /^#[0-9a-f]{6}$/i.test(str(o.color, 7)) ? str(o.color, 7) : "#ffffff", x: num(o.x, 0, 1, 0.9), y: num(o.y, 0, 1, 0.92), size: num(o.size, 0.01, 0.1, 0.028), glow: num(o.glow, 0, 1, 0.3), align: ["left", "center", "right"].includes(o.align as string) ? (o.align as "left") : "right", rotate: o.rotate === 90 ? 90 : 0 } as OverlaySpec);
      } else if (o?.kind === "frame" && ["polaroid", "thin", "rounded", "film"].includes(o.style as string)) {
        overlays.push({ kind: "frame", style: o.style as "polaroid", color: /^#[0-9a-f]{6}$/i.test(str(o.color, 7)) ? str(o.color, 7) : "#f4efe6" } as OverlaySpec);
      }
    }
  }
  return { id: newId(), name: str(raw.n, 40) || "Shared look", blurb: str(raw.b, 120), layers, overlays, aspect: typeof raw.a === "number" ? num(raw.a, 0.4, 2.5, 0.75) : undefined, created: Date.now() };
}

export async function decodeLook(code: string): Promise<SavedLook | null> {
  try {
    const t = code.trim();
    const dot = t.indexOf(".");
    const tag = t.slice(0, dot), body = t.slice(dot + 1);
    if (tag !== "PIXI1" && tag !== "PIXI0") return null;
    const bytes = unb64u(body);
    const raw = tag === "PIXI1" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    if (raw.length > 64_000) return null;
    return sanitizeLook(JSON.parse(new TextDecoder().decode(raw)));
  } catch { return null; }
}

/** Generic compressed text codes (used for nearby-share handshakes). */
export async function packText(prefix: string, text: string): Promise<string> {
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return `${prefix}0.` + b64u(raw);
  return `${prefix}1.` + b64u(await pipe(raw, new CompressionStream("deflate-raw")));
}
export async function unpackText(prefix: string, code: string): Promise<string | null> {
  try {
    const t = code.trim(); const dot = t.indexOf(".");
    const tag = t.slice(0, dot), body = t.slice(dot + 1);
    if (tag !== `${prefix}0` && tag !== `${prefix}1`) return null;
    const bytes = unb64u(body);
    const raw = tag === `${prefix}1` ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    return raw.length > 32_000 ? null : new TextDecoder().decode(raw);
  } catch { return null; }
}
