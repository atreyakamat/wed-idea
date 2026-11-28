import type { LayerSpec } from "@/pixi/engine/types";

/**
 * A lens sits in front of whatever look is loaded, the way a clip-on lens sits in front of a camera.
 * It is kept separate from the looks on purpose: there are 84 of those, and a lens that had to be
 * baked into each one would mean 84 times as many. Picking a lens prepends its layers, so every
 * look can be shot through every lens.
 */
export type LensId = "none" | "fisheye" | "wide" | "soft" | "prism" | "scope";

export interface Lens {
  id: LensId;
  name: string;
  /** One line, in the viewfinder, saying what it does to the picture. */
  hint: string;
  layers: LayerSpec[];
}

const L = (kind: LayerSpec["kind"], params: Record<string, number>): LayerSpec => ({ kind, params });

export const LENSES: Lens[] = [
  { id: "none", name: "Normal", hint: "No lens", layers: [] },
  {
    id: "wide",
    name: "Wide",
    hint: "A gentle bulge, a little more in frame",
    layers: [L("distort", { fisheye: 0.35, zoom: 1.04, circle: 0 })],
  },
  {
    id: "fisheye",
    name: "Fisheye",
    hint: "Hard bulge, the middle pushed forward",
    // Edges stretch most, so a touch of fringing sells it as glass rather than maths.
    layers: [L("distort", { fisheye: 1, zoom: 0.96, circle: 0 }), L("chromatic", { amount: 0.35, lateral: 0.8 })],
  },
  {
    id: "scope",
    name: "Scope",
    hint: "A round porthole with dark corners",
    layers: [L("distort", { fisheye: 0.85, zoom: 0.82, circle: 1 })],
  },
  {
    id: "soft",
    name: "Soft",
    hint: "A hazy glow, the way an old portrait lens flares",
    layers: [L("diffuse", { radius: 9, amount: 0.55 })],
  },
  {
    id: "prism",
    name: "Prism",
    hint: "Split colour at the edges, like cheap glass",
    layers: [L("chromatic", { amount: 1, lateral: 1 }), L("diffuse", { radius: 5, amount: 0.22 })],
  },
];

export const lensById = (id: LensId): Lens => LENSES.find((l) => l.id === id) ?? LENSES[0];

/** The lens goes first, so the look's grade, grain and vignette all land on the bent picture. */
export function withLens(layers: LayerSpec[], id: LensId): LayerSpec[] {
  const lens = lensById(id);
  return lens.layers.length ? [...lens.layers, ...layers] : layers;
}

const KEY = "pixi:lens:v1";

export function loadLens(): LensId {
  try {
    const v = localStorage.getItem(KEY);
    return LENSES.some((l) => l.id === v) ? (v as LensId) : "none";
  } catch { return "none"; }
}

export function saveLens(id: LensId) {
  try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
}
