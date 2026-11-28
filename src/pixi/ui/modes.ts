import type { LayerSpec, Preset } from "@/pixi/engine/types";

export type ModeId = "photo" | "portrait" | "night" | "pro" | "video" | "timelapse" | "booth";
export const MODES: { id: ModeId; label: string }[] = [
  { id: "photo", label: "Photo" },
  { id: "portrait", label: "Portrait" },
  { id: "night", label: "Night" },
  { id: "pro", label: "Pro" },
  { id: "video", label: "Video" },
  { id: "timelapse", label: "Timelapse" },
  { id: "booth", label: "Booth" },
];

export interface ProState {
  ev: number; warm: number; tint: number; contrast: number; sat: number; sharp: number; grain: number; look: boolean;
}
export const PRO_DEFAULT: ProState = { ev: 0, warm: 0, tint: 0, contrast: 0, sat: 0, sharp: 0, grain: 0, look: true };

export const PRO_CONTROLS: { key: keyof Omit<ProState, "look">; label: string; min: number; max: number; step: number }[] = [
  { key: "ev", label: "Exposure", min: -2, max: 2, step: 0.05 },
  { key: "warm", label: "Warmth", min: -1, max: 1, step: 0.02 },
  { key: "tint", label: "Tint", min: -1, max: 1, step: 0.02 },
  { key: "contrast", label: "Contrast", min: -0.5, max: 0.8, step: 0.02 },
  { key: "sat", label: "Saturation", min: -1, max: 1, step: 0.02 },
  { key: "sharp", label: "Sharpness", min: 0, max: 1, step: 0.02 },
  { key: "grain", label: "Grain", min: 0, max: 1, step: 0.02 },
];

export interface ModeCtx { pro: ProState; focus: [number, number]; portraitBlur: number }

/** Builds the final look for a capture mode. Modes only add data (layers) in front of the chosen camera. */
export function applyMode(base: Preset, mode: ModeId, ctx: ModeCtx): Preset {
  const front: LayerSpec[] = [];
  let layers = base.layers;
  if (mode === "portrait") {
    front.push({ kind: "portraitBlur", params: { fx: ctx.focus[0], fy: ctx.focus[1], radius: 0.24, feather: 0.32, strength: ctx.portraitBlur, bokeh: 0.6 } });
  }
  if (mode === "night") {
    front.push({ kind: "denoise", params: { strength: 0.65, lift: 0.55, gain: 0.5 } });
  }
  if (mode === "pro") {
    const p = ctx.pro;
    front.push({ kind: "grade", params: { exposure: p.ev * 0.5, contrast: p.contrast, saturation: p.sat, temperature: p.warm, tint: p.tint } });
    if (p.sharp > 0) front.push({ kind: "lofi", params: { sharpen: p.sharp } });
    if (p.grain > 0) front.push({ kind: "grain", params: { amount: p.grain * 0.7, size: 1.1, chroma: 0.2 } });
    if (!p.look) layers = [];
  }
  return { ...base, layers: [...front, ...layers] };
}
