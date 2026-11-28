import type { LayerSpec } from "@/pixi/engine/types";
import { L } from "./helpers";

export interface FilmStock {
  id: string; name: string; maker: string; iso: number; kind: "Colour negative" | "Slide" | "Black & white" | "Cinema" | "Expired" | "Special";
  blurb: string; body: string; label: string; layers: LayerSpec[];
}

// Original film-stock recipes with fictional makers. They replace the camera's colour/grain and keep its lens character.
export const FILMS: FilmStock[] = [
  { id: "fs-gold-200", name: "Gold 200", maker: "Halcyon", iso: 200, kind: "Colour negative", body: "#e0a93a", label: "#ffd75e", blurb: "Warm everyday negative: golden highlights, gentle contrast.",
    layers: [L("filmCurve", { black: 0.02, toe: 0.3, shoulder: 0.25 }), L("grade", { exposure: 0.05, contrast: 0.1, saturation: 0.15, temperature: 0.25, tint: -0.03, fade: 0.06 }), L("splitTone", { shadowHue: 200, shadowAmt: 0.15, highHue: 40, highAmt: 0.3 }), L("grain", { amount: 0.3, size: 1.2, chroma: 0.25 })] },
  { id: "fs-ultra-400", name: "Ultra 400", maker: "Halcyon", iso: 400, kind: "Colour negative", body: "#2f6f4a", label: "#9be28d", blurb: "Punchy and green-leaning, strong reds, visible grain.",
    layers: [L("filmCurve", { black: 0.02, toe: 0.35, shoulder: 0.3 }), L("grade", { exposure: 0.0, contrast: 0.22, saturation: 0.3, temperature: 0.05, tint: -0.12 }), L("grain", { amount: 0.45, size: 1.4, chroma: 0.3 })] },
  { id: "fs-portrait-160", name: "Portrait 160", maker: "Halcyon", iso: 160, kind: "Colour negative", body: "#d98a9a", label: "#ffd3dc", blurb: "Soft pastel skin, low contrast, fine grain.",
    layers: [L("filmCurve", { black: 0.03, toe: 0.2, shoulder: 0.35 }), L("grade", { exposure: 0.12, contrast: -0.08, saturation: -0.05, temperature: 0.1, tint: 0.1, fade: 0.12, skinProtect: 0.8 }), L("diffuse", { radius: 10, amount: 0.15 }), L("grain", { amount: 0.18, size: 1.0 })] },
  { id: "fs-slide-100", name: "Slide 100", maker: "Halcyon", iso: 100, kind: "Slide", body: "#b8322e", label: "#ffd0b8", blurb: "Deep saturated slide film with hard contrast and clean blacks.",
    layers: [L("filmCurve", { black: 0.0, toe: 0.5, shoulder: 0.2 }), L("grade", { exposure: -0.05, contrast: 0.4, saturation: 0.55, temperature: -0.02 }), L("grain", { amount: 0.12, size: 0.9 })] },
  { id: "fs-bw-400", name: "Mono 400", maker: "Lumio", iso: 400, kind: "Black & white", body: "#303136", label: "#e6e6e6", blurb: "Classic black and white, rich mids, honest grain.",
    layers: [L("grade", { contrast: 0.2, saturation: -1 }), L("filmCurve", { black: 0.03, toe: 0.35, shoulder: 0.3 }), L("grain", { amount: 0.5, size: 1.4, chroma: 0 })] },
  { id: "fs-bw-hicon", name: "Mono Hi-Con", maker: "Kestrel", iso: 800, kind: "Black & white", body: "#111", label: "#ffffff", blurb: "Crushed blacks and blown whites for graphic street shots.",
    layers: [L("grade", { exposure: 0.05, contrast: 0.65, saturation: -1 }), L("filmCurve", { black: 0.0, toe: 0.6, shoulder: 0.1 }), L("grain", { amount: 0.6, size: 1.6, chroma: 0 }), L("vignette", { amount: 0.35 })] },
  { id: "fs-tungsten-800", name: "Tungsten 800T", maker: "Vanta", iso: 800, kind: "Cinema", body: "#2a5a7a", label: "#bfe8ff", blurb: "Cool cyan night film with red halation around lights.",
    layers: [L("grade", { exposure: -0.05, contrast: 0.2, saturation: 0.1, temperature: -0.35, tint: 0.0 }), L("splitTone", { shadowHue: 205, shadowAmt: 0.5, highHue: 18, highAmt: 0.4 }), L("bloom", { threshold: 0.5, intensity: 1.0, radius: 26, warmth: 0.9 }), L("grain", { amount: 0.5, size: 1.5 })] },
  { id: "fs-cine-500", name: "Cine 500", maker: "Vanta", iso: 500, kind: "Cinema", body: "#e07a30", label: "#6fd0d8", blurb: "Teal shadows, orange skin: the movie look.",
    layers: [L("filmCurve", { black: 0.03, toe: 0.4, shoulder: 0.3 }), L("grade", { exposure: -0.03, contrast: 0.25, saturation: 0.1, skinProtect: 0.5 }), L("splitTone", { shadowHue: 190, shadowAmt: 0.6, highHue: 32, highAmt: 0.6 }), L("grain", { amount: 0.3, size: 1.2 }), L("vignette", { amount: 0.3 })] },
  { id: "fs-fine-100", name: "Fine 100", maker: "Lumio", iso: 100, kind: "Colour negative", body: "#4a78b8", label: "#d7e6ff", blurb: "Neutral, clean and fine grained. The honest one.",
    layers: [L("filmCurve", { black: 0.015, toe: 0.2, shoulder: 0.2 }), L("grade", { contrast: 0.08, saturation: 0.05 }), L("grain", { amount: 0.12, size: 0.9, chroma: 0.15 })] },
  { id: "fs-expired-98", name: "Expired '98", maker: "Solstice", iso: 400, kind: "Expired", body: "#7a8a4a", label: "#f0e6a0", blurb: "Years past date: green cast, faded blacks, blotchy grain.",
    layers: [L("grade", { exposure: 0.1, contrast: -0.05, saturation: -0.1, temperature: -0.05, tint: -0.3, fade: 0.3 }), L("channelMix", { rGain: 0.94, gGain: 1.06, bGain: 0.92, bLift: 0.03 }), L("grain", { amount: 0.65, size: 1.8, chroma: 0.5 }), L("dust", { density: 0.5, scratches: 0.3 })] },
  { id: "fs-redscale-200", name: "Redscale 200", maker: "Tamarind", iso: 200, kind: "Special", body: "#b8281c", label: "#ffb15e", blurb: "Flipped film: everything glows red and amber.",
    layers: [L("channelMix", { rGain: 1.25, gGain: 0.85, bGain: 0.45 }), L("grade", { exposure: 0.05, contrast: 0.2, saturation: 0.1, temperature: 0.2 }), L("bloom", { threshold: 0.55, intensity: 0.8, radius: 22, warmth: 0.9 }), L("grain", { amount: 0.4, size: 1.3 })] },
  { id: "fs-aqua-cross", name: "Cross Aqua", maker: "Orbis", iso: 100, kind: "Special", body: "#1f9aa8", label: "#c8fff0", blurb: "Cross-processed slide: cyan shadows, yellow highlights.",
    layers: [L("filmCurve", { black: 0.0, toe: 0.55, shoulder: 0.15 }), L("grade", { contrast: 0.3, saturation: 0.35, temperature: 0.0, tint: -0.1 }), L("splitTone", { shadowHue: 175, shadowAmt: 0.6, highHue: 58, highAmt: 0.6 }), L("grain", { amount: 0.3, size: 1.2 })] },
  { id: "fs-halation-800", name: "Halation 800", maker: "Vanta", iso: 800, kind: "Cinema", body: "#8a1f2a", label: "#ff9a6a", blurb: "Soft red glow around highlights, moody low light.",
    layers: [L("grade", { exposure: -0.1, contrast: 0.15, saturation: 0.05, temperature: 0.1 }), L("bloom", { threshold: 0.45, intensity: 1.3, radius: 30, warmth: 1.0 }), L("diffuse", { radius: 12, amount: 0.15 }), L("grain", { amount: 0.55, size: 1.5 }), L("vignette", { amount: 0.4 })] },
  { id: "fs-sepia", name: "Sepia Print", maker: "Tamarind", iso: 50, kind: "Special", body: "#8a5a2a", label: "#f5deb0", blurb: "Warm toned monochrome print with soft edges.",
    layers: [L("grade", { contrast: 0.12, saturation: -1 }), L("splitTone", { shadowHue: 30, shadowAmt: 0.7, highHue: 45, highAmt: 0.6 }), L("filmCurve", { black: 0.04, toe: 0.3, shoulder: 0.3 }), L("grain", { amount: 0.3 }), L("vignette", { amount: 0.5 })] },
];
