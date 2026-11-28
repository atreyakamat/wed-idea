import type { LayerSpec, OverlaySpec, Preset } from "@/pixi/engine/types";
import { PRESETS } from "@/pixi/presets";

export type Body = "fisheye" | "disposable" | "tv" | "cctv" | "webcam" | "super8" | "flip" | "compact" | "slab" | "bridge" | "toy" | "phone" | "slider" | "camcorder" | "instant";
export interface CameraDef { brand: string; preset: Preset; body: Body; color: string; model: string; row: "Digicam" | "Special" | "Mine" }

const COLORS = ["#c9ccd1", "#2b2d33", "#d9a441", "#b5474a", "#5b8fb9", "#8fae7e", "#e8e0d0", "#8a6bb0"];
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

const FAMILY_BODY: Record<string, Body[]> = {
  "Button Phone": ["phone", "slider"],
  "Flip Phone": ["flip"],
  Fisheye: ["fisheye"],
  Disposable: ["disposable"],
  "CRT & TV": ["tv"],
  "Security Cam": ["cctv"],
  Webcam: ["webcam"],
  "Super 8": ["super8"],
  "VHS & Camcorder": ["camcorder"],
  "Instant Print": ["instant"],
  "Toy Lens": ["toy"],
  "35mm Scan": ["bridge", "slab"],
  "0.1MP": ["phone"],
};
const BODY_BY_ID: Record<string, Body> = { "lr-vga-02": "phone", "lr-flip-03": "flip", "lr-webcam-00": "webcam", "lr-pocket-mono": "toy" };
const DIGI = new Set(["Fisheye", "Disposable", "Y2K", "Date Stamp", "Blown-out", "Night Blur", "Flash & Compact", "Golden Hour", "Button Phone", "Flip Phone", "0.1MP"]);

// Fictional makers (no real trademarks). Each family belongs to one maker, like a real lineup.
export const BRAND_OF: Record<string, { brand: string; prefix: string }> = {
  "Date Stamp": { brand: "Kestrel", prefix: "KD" },
  "Flash & Compact": { brand: "Kestrel", prefix: "KF" },
  "Blown-out": { brand: "Lumio", prefix: "LB" },
  "Night Blur": { brand: "Lumio", prefix: "LN" },
  "Golden Hour": { brand: "Lumio", prefix: "LG" },
  "35mm Scan": { brand: "Halcyon", prefix: "HX" },
  "Instant Print": { brand: "Solstice", prefix: "SI" },
  "VHS & Camcorder": { brand: "Orbis", prefix: "OV" },
  "Toy Lens": { brand: "Tamarind", prefix: "TT" },
  "Button Phone": { brand: "Brickwell", prefix: "BW" },
  "Flip Phone": { brand: "Zephyr", prefix: "ZF" },
  Creative: { brand: "Vanta", prefix: "VX" },
  Fisheye: { brand: "Nimbus", prefix: "NF" },
  Disposable: { brand: "Tamarind", prefix: "TD" },
  "CRT & TV": { brand: "Orbis", prefix: "OT" },
  "Security Cam": { brand: "Orbis", prefix: "OS" },
  Webcam: { brand: "Nimbus", prefix: "NW" },
  "Super 8": { brand: "Halcyon", prefix: "HC" },
  Y2K: { brand: "Kestrel", prefix: "KY" },
  "0.1MP": { brand: "Nibble", prefix: "NB" },
};
export const BRANDS = Array.from(new Set(Object.values(BRAND_OF).map((b) => b.brand)));

export const CAMERAS: CameraDef[] = PRESETS.map((p) => {
  const h = hash(p.id);
  const bodies = FAMILY_BODY[p.family] ?? ["compact", "slab"];
  const b = BRAND_OF[p.family] ?? { brand: "Vanta", prefix: "VX" };
  return {
    brand: b.brand,
    preset: p,
    body: BODY_BY_ID[p.id] ?? bodies[h % bodies.length],
    color: COLORS[(h >>> 3) % COLORS.length],
    model: `${b.prefix}-${10 + ((h >>> 6) % 90)}`,
    row: DIGI.has(p.family) ? "Digicam" : "Special",
  };
});

export type EffectId = "sparkle" | "frame" | "light";
export const EFFECTS: { id: EffectId; label: string }[] = [
  { id: "sparkle", label: "Sparkle" },
  { id: "frame", label: "Frame" },
  { id: "light", label: "Light leak" },
];

export interface StampDef { id: string; label: string; sample: string; overlay: OverlaySpec | null }
const st = (style: "seg7" | "dot" | "sans" | "mono" | "vcr", format: string, color: string, x: number, y: number, size: number, extra: Partial<Extract<OverlaySpec, { kind: "stamp" }>> = {}): OverlaySpec =>
  ({ kind: "stamp", style, format, color, x, y, size, glow: 0.3, align: "right", ...extra });

/** Timestamp styles. "preset" keeps whatever the look ships with; "off" removes stamps. */
export const STAMPS: StampDef[] = [
  { id: "preset", label: "Look default", sample: "auto", overlay: null },
  { id: "off", label: "Off", sample: "none", overlay: null },
  { id: "orange", label: "Orange LED", sample: "'26 11 10", overlay: st("seg7", "'YY MM DD", "#ff9a2e", 0.94, 0.94, 0.028) },
  { id: "orange-time", label: "LED + time", sample: "11 10 '26  17:06", overlay: st("seg7", "MM DD 'YY  HH:mm", "#ff8a1e", 0.94, 0.94, 0.026) },
  { id: "yellow-dot", label: "Dot matrix", sample: "2026.11.10", overlay: st("dot", "YYYY.MM.DD", "#ffd23c", 0.94, 0.94, 0.03, { glow: 0.4 }) },
  { id: "white-mono", label: "Clean mono", sample: "11/10/2026", overlay: st("mono", "MM/DD/YYYY", "#ffffff", 0.94, 0.95, 0.026, { glow: 0.1 }) },
  { id: "vcr", label: "VCR", sample: "TUE 11.10.2026", overlay: st("vcr", "DOW MM.DD.YYYY", "#ffffff", 0.06, 0.92, 0.04, { align: "left", glow: 0.5 }) },
  { id: "vcr-clock", label: "VCR clock", sample: "05:06 PM", overlay: st("vcr", "hh:mm AMPM", "#ffffff", 0.06, 0.08, 0.04, { align: "left", glow: 0.5 }) },
  { id: "sans", label: "Sans date", sample: "10.11.2026", overlay: st("sans", "DD.MM.YYYY", "#ffffff", 0.06, 0.95, 0.028, { align: "left", glow: 0.1 }) },
  { id: "typewriter", label: "Typewriter", sample: "10 / 11 / 26", overlay: st("mono", "DD / MM / YY", "#f2e8c9", 0.5, 0.95, 0.026, { align: "center", glow: 0 }) },
  { id: "film-edge", label: "Film edge", sample: "'26 11 10", overlay: st("seg7", "'YY MM DD", "#ff9a2e", 0.97, 0.5, 0.026, { rotate: 90, align: "center" }) },
];

export interface FxState { effects: Set<EffectId>; stamp: string }

/** Returns a new preset with effects stacked on top. Looks stay pure data. */
export function withEffects(base: Preset, fx: FxState): Preset {
  const layers: LayerSpec[] = [...base.layers];
  let overlays: OverlaySpec[] = [...(base.overlays ?? [])];
  const { effects: on, stamp } = fx;
  if (on.has("sparkle")) {
    layers.push({ kind: "bloom", params: { threshold: 0.7, intensity: 0.7, radius: 22, warmth: 0.1 } });
    layers.push({ kind: "flare", params: { x: 0.8, y: 0.2, intensity: 0.7, hue: 330, ghosts: 0.5, streakLen: 0.7, angle: 45 } });
  }
  if (on.has("light")) layers.push({ kind: "lightLeak", params: { hue: 20, intensity: 0.55, x: 1, y: 0.4 } });
  if (stamp !== "preset") {
    overlays = overlays.filter((o) => o.kind !== "stamp");
    const def = STAMPS.find((x) => x.id === stamp);
    if (def?.overlay) overlays.push(def.overlay);
  }
  if (on.has("frame") && !overlays.some((o) => o.kind === "frame")) overlays.push({ kind: "frame", style: "polaroid", color: "#f4efe6" });
  return { ...base, layers, overlays };
}

import type { FilmStock } from "@/pixi/presets/films";
import type { GpuLayerKind } from "@/pixi/engine/types";

/** Camera card for a user-made look. */
export function cameraFromPreset(p: Preset): CameraDef {
  const h = hash(p.id);
  return { brand: "My Looks", preset: p, body: (["compact", "slab", "bridge", "toy", "flip", "super8"] as Body[])[h % 6], color: COLORS[(h >>> 3) % COLORS.length], model: `ME-${10 + ((h >>> 6) % 90)}`, row: "Mine" };
}

const COLOUR_KINDS: GpuLayerKind[] = ["grade", "splitTone", "channelMix", "filmCurve", "grain"];
/** A film stock replaces the camera's colour and grain, and keeps its lens and artefact layers. */
export function withFilm(base: Preset, film: FilmStock | null): Preset {
  if (!film) return base;
  return { ...base, layers: [...base.layers.filter((l) => !COLOUR_KINDS.includes(l.kind)), ...film.layers] };
}
