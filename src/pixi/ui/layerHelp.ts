import type { GpuLayerKind } from "@/pixi/engine/types";

export type Cat = "Color" | "Texture" | "Light" | "Lens" | "Screen";
export const LAYER_HELP: Record<GpuLayerKind, { cat: Cat; title: string; help: string }> = {
  grade: { cat: "Color", title: "Color grade", help: "Exposure, contrast, saturation, warmth and tint. Start here." },
  splitTone: { cat: "Color", title: "Split tone", help: "Tint the shadows and highlights different colours, like film or cinema grading." },
  channelMix: { cat: "Color", title: "Channel mix", help: "Scale or lift the red, green and blue channels for strong colour casts." },
  filmCurve: { cat: "Color", title: "Film curve", help: "Soft toe and shoulder so blacks fade and highlights roll off like film." },
  grain: { cat: "Texture", title: "Film grain", help: "Animated grain. Raise size for coarse, fast film." },
  lofi: { cat: "Texture", title: "Low-fi sensor", help: "Big pixels, noise, JPEG blocks and over-sharpening from cheap sensors." },
  dust: { cat: "Texture", title: "Dust & scratches", help: "Specks and scratches like an old print or reel." },
  texture: { cat: "Texture", title: "Gate weave", help: "Subtle frame wobble and paper texture." },
  bloom: { cat: "Light", title: "Bloom", help: "Bright areas glow. Lower the threshold to glow more." },
  diffuse: { cat: "Light", title: "Soft focus", help: "Dreamy diffusion over the whole frame." },
  lightLeak: { cat: "Light", title: "Light leak", help: "Coloured light bleeding in from an edge." },
  flare: { cat: "Light", title: "Lens flare", help: "Streaks and ghosts from a bright source." },
  flash: { cat: "Light", title: "Direct flash", help: "Hot centre with dark falloff, like on-camera flash." },
  vignette: { cat: "Light", title: "Vignette", help: "Darken the corners to pull the eye in." },
  chromatic: { cat: "Lens", title: "Colour fringe", help: "Red and blue edges separate, like a cheap lens." },
  blur: { cat: "Lens", title: "Blur", help: "Straight or edge-only blur, including motion direction." },
  distort: { cat: "Lens", title: "Lens distortion", help: "Barrel / fisheye bend, zoom and a round mask." },
  portraitBlur: { cat: "Lens", title: "Portrait blur", help: "Sharp zone with blurred surroundings and bokeh glow." },
  scanlines: { cat: "Screen", title: "Scanlines & tape", help: "CRT lines, tape bleed, glitches and rolling bars." },
  denoise: { cat: "Light", title: "Night / denoise", help: "Smooth noise and lift shadows for low light." },
};
export const CATS: Cat[] = ["Color", "Texture", "Light", "Lens", "Screen"];

export const GUIDE_STEPS = [
  { t: "A look is a stack of layers", d: "Layers run top to bottom, each one changing the result of the one above it. Order matters: grade before grain looks different from grain before grade." },
  { t: "Start from something close", d: "Pick any camera as a template, or start blank. It is faster to tweak a look than to build one from nothing." },
  { t: "Add, tweak, reorder", d: "Add layers from Color, Texture, Light, Lens and Screen. Tap a layer to open its sliders. Use the arrows to reorder and the switch to turn a layer off." },
  { t: "Compare as you go", d: "Hold the Compare button to see the original photo. Undo and redo step through your changes." },
  { t: "Save and share", d: "Save to My Looks, then share the look as a QR code. Another phone scans it and gets the exact same look, no internet needed." },
];
