import type { OverlaySpec } from "@/pixi/engine/types";
import { L, osd, preset, seg7 } from "./helpers";

// Date stamps, flash/compact digicams, button-phone sensors, blown-out and night-blur looks.

const stamp = (o: Partial<Extract<OverlaySpec, { kind: "stamp" }>> & { style: Extract<OverlaySpec, { kind: "stamp" }>["style"]; format: string; color: string }): OverlaySpec => ({
  kind: "stamp",
  x: 0.95,
  y: 0.95,
  size: 0.03,
  align: "right",
  ...o,
});

export const dateStamp = [
  preset({
    id: "ds-orange-segment",
    name: "Orange Segment",
    family: "Date Stamp",
    blurb: "Warm point-and-shoot with a glowing orange 7-segment date.",
    layers: [
      L("grade", { exposure: -0.05, contrast: 0.1, saturation: 0.05, temperature: 0.3, fade: 0.1, skinProtect: 0.5 }),
      L("splitTone", { shadowHue: 175, shadowAmt: 0.4, highHue: 35, highAmt: 0.5 }),
      L("bloom", { threshold: 0.6, intensity: 0.5, radius: 18, warmth: 0.6 }),
      L("vignette", { amount: 0.3 }),
      L("grain", { amount: 0.3, size: 1.2, chroma: 0.25 }),
    ],
    overlays: [seg7("#ff7a1a", 0.94, 0.92, 0.03)],
  }),
  preset({
    id: "ds-yellow-dot",
    name: "Yellow Dot Night",
    family: "Date Stamp",
    blurb: "Night blur with a vertical yellow dot-matrix stamp.",
    layers: [
      L("blur", { radius: 6, angle: 12, mode: 1 }),
      L("grade", { exposure: -0.3, contrast: 0.3, saturation: -0.1, temperature: -0.25, tint: 0.05, shadows: 0.1 }),
      L("splitTone", { shadowHue: 110, shadowAmt: 0.4, highHue: 40, highAmt: 0.4 }),
      L("bloom", { threshold: 0.6, intensity: 0.8, radius: 20, warmth: 0.4 }),
      L("vignette", { amount: 0.35 }),
      L("grain", { amount: 0.35, size: 1.4, chroma: 0.4 }),
      L("dust", { density: 0.4, scratches: 0.1, strength: 0.4 }),
    ],
    overlays: [stamp({ style: "dot", format: "'YY MM DD", color: "#ffd84a", x: 0.075, y: 0.9, size: 0.019, rotate: 90, align: "left", glow: 0.3 })],
  }),
  preset({
    id: "ds-clean-stamp",
    name: "Clean Stamp",
    family: "Date Stamp",
    blurb: "Cheap phone-cam look with a bold white date and time.",
    layers: [
      L("grade", { exposure: 0.0, contrast: 0.22, saturation: 0.0, temperature: -0.04, tint: -0.22 }),
      L("diffuse", { radius: 6, amount: 0.15 }),
      L("lofi", { pixel: 1.5, sharpen: 0.3, blocks: 0.25, noise: 0.25, chromaNoise: 0.2 }),
      L("vignette", { amount: 0.2 }),
    ],
    overlays: [
      stamp({ style: "sans", format: "DD-MM-YYYY", color: "#ffffff", y: 0.91, size: 0.026 }),
      stamp({ style: "sans", format: "hh:mm AMPM", color: "#ffffff", y: 0.94, size: 0.026 }),
    ],
  }),
  preset({
    id: "ds-tiny-digital",
    name: "Tiny Digital",
    family: "Date Stamp",
    blurb: "Overexposed, soft and low-res with a tiny white stamp.",
    layers: [
      L("grade", { exposure: -0.05, contrast: 0.32, saturation: 0.45, temperature: -0.1, tint: -0.05 }),
      L("bloom", { threshold: 0.5, intensity: 1.0, radius: 24 }),
      L("diffuse", { radius: 12, amount: 0.3 }),
      L("lofi", { pixel: 1.8, noise: 0.3, chromaNoise: 0.25, blocks: 0.3, sharpen: 0.2 }),
      L("vignette", { amount: 0.2 }),
    ],
    overlays: [stamp({ style: "mono", format: "MM/DD/YYYY hh:mm", color: "#ffffff", x: 0.96, y: 0.965, size: 0.017 })],
  }),
  preset({
    id: "ds-block-2012",
    name: "Block 2012",
    family: "Date Stamp",
    blurb: "Washed, glowing 2012 phone photo with a yellow side stamp.",
    layers: [
      L("grade", { exposure: 0.0, contrast: 0.18, saturation: 0.2, temperature: -0.3, tint: 0.05 }),
      L("diffuse", { radius: 30, amount: 0.5 }),
      L("bloom", { threshold: 0.4, intensity: 1.0, radius: 36, warmth: 0.5 }),
      L("blur", { radius: 5, mode: 0 }),
      L("lofi", { pixel: 1.6, noise: 0.3, chromaNoise: 0.3, blocks: 0.35 }),
    ],
    overlays: [stamp({ style: "sans", format: "MM/DD/YYYY hh:mm AMPM", color: "#f6d51e", x: 0.955, y: 0.985, size: 0.022, rotate: 90, align: "left" })],
  }),
];

export const blownOut = [
  preset({
    id: "bd-washed-out",
    name: "Washed Out",
    family: "Blown-out",
    blurb: "Overexposed and dreamy, highlights melt into everything.",
    layers: [
      L("grade", { exposure: 0.5, contrast: -0.2, saturation: -0.05, temperature: 0.15, fade: 0.25, highlights: 0.1 }),
      L("bloom", { threshold: 0.35, intensity: 1.2, radius: 40, warmth: 0.3 }),
      L("diffuse", { radius: 34, amount: 0.5 }),
      L("lofi", { pixel: 2, noise: 0.25, chromaNoise: 0.3, blocks: 0.35, sharpen: 0.15 }),
      L("vignette", { amount: 0.15 }),
    ],
  }),
  preset({
    id: "bd-window-blown",
    name: "Window Blown",
    family: "Blown-out",
    blurb: "Bright windows bloom into the room, everything warm and soft.",
    layers: [
      L("filmCurve", { shoulder: 0.2 }),
      L("grade", { exposure: 0.3, contrast: 0.05, temperature: 0.35, fade: 0.15, highlights: 0.2 }),
      L("splitTone", { shadowHue: 30, shadowAmt: 0.3, highHue: 42, highAmt: 0.4 }),
      L("bloom", { threshold: 0.35, intensity: 1.3, radius: 50, warmth: 0.5 }),
      L("blur", { radius: 8, mode: 0 }),
      L("diffuse", { radius: 30, amount: 0.45 }),
      L("vignette", { amount: 0.35 }),
      L("grain", { amount: 0.3 }),
    ],
  }),
  preset({
    id: "bd-soft-focus",
    name: "Soft Focus",
    family: "Blown-out",
    blurb: "Gentle blur and glow. Flattering on faces.",
    layers: [
      L("blur", { radius: 5, mode: 0 }),
      L("grade", { exposure: 0.1, contrast: -0.15, saturation: 0.05, temperature: 0.1, fade: 0.2, skinProtect: 0.6 }),
      L("diffuse", { radius: 26, amount: 0.65 }),
      L("bloom", { threshold: 0.55, intensity: 0.5, radius: 26 }),
      L("grain", { amount: 0.15 }),
    ],
  }),
  preset({
    id: "bd-sun-orb",
    name: "Sun Orb",
    family: "Blown-out",
    blurb: "Big glowing sun in the middle of the frame, vivid colour.",
    layers: [
      L("grade", { exposure: 0.1, contrast: 0.05, saturation: 0.25, temperature: 0.3 }),
      L("flare", { x: 0.5, y: 0.6, intensity: 0.9, hue: 28, size: 0.5, streakLen: 0.3, angle: 0, ghosts: 0.5 }),
      L("bloom", { threshold: 0.45, intensity: 1.0, radius: 44, warmth: 0.7 }),
      L("diffuse", { radius: 20, amount: 0.3 }),
      L("vignette", { amount: 0.3 }),
      L("chromatic", { amount: 0.2 }),
      L("grain", { amount: 0.2 }),
    ],
  }),
];

export const nightBlur = [
  preset({
    id: "mn-night-streak",
    name: "Night Streak",
    family: "Night Blur",
    blurb: "Handheld night: light streaks, green-brown shadows, heavy grain.",
    layers: [
      L("blur", { radius: 14, angle: 0, mode: 1 }),
      L("grade", { exposure: -0.15, contrast: 0.15, saturation: 0.1, temperature: 0.15, tint: 0.1, shadows: 0.1 }),
      L("splitTone", { shadowHue: 105, shadowAmt: 0.5, highHue: 42, highAmt: 0.5 }),
      L("bloom", { threshold: 0.45, intensity: 1.2, radius: 30, warmth: 0.4 }),
      L("chromatic", { amount: 0.3, lateral: 0.5 }),
      L("vignette", { amount: 0.4 }),
      L("grain", { amount: 0.4, size: 1.3, chroma: 0.4, response: 0.7 }),
      L("dust", { density: 0.4, scratches: 0.1 }),
    ],
  }),
  preset({
    id: "mn-paparazzi",
    name: "Paparazzi",
    family: "Night Blur",
    blurb: "Harsh flash, sideways streaks, cheap-sensor crunch.",
    layers: [
      L("flash", { intensity: 0.8, falloff: 0.6, hue: 50, y: 0.4, blow: 0.5 }),
      L("blur", { radius: 10, angle: 2, mode: 1 }),
      L("bloom", { threshold: 0.5, intensity: 1.1, radius: 28, warmth: -0.1 }),
      L("grade", { contrast: 0.2, saturation: 0.1, temperature: -0.05 }),
      L("lofi", { pixel: 1.5, noise: 0.35, chromaNoise: 0.3, blocks: 0.3, sharpen: 0.3 }),
      L("chromatic", { amount: 0.4, lateral: 1 }),
      L("grain", { amount: 0.25 }),
    ],
  }),
  preset({
    id: "mn-rain-glass",
    name: "Rain Glass",
    family: "Night Blur",
    blurb: "Shooting through wet glass: smeared lights, cool cyan-green.",
    layers: [
      L("blur", { radius: 9, mode: 0 }),
      L("diffuse", { radius: 24, amount: 0.5 }),
      L("grade", { exposure: -0.1, contrast: 0.1, saturation: -0.1, temperature: -0.2, tint: 0.15, fade: 0.1 }),
      L("splitTone", { shadowHue: 180, shadowAmt: 0.5, highHue: 55, highAmt: 0.35 }),
      L("bloom", { threshold: 0.5, intensity: 1.0, radius: 30, warmth: 0.1 }),
      L("chromatic", { amount: 0.25 }),
      L("vignette", { amount: 0.35 }),
      L("grain", { amount: 0.3 }),
    ],
  }),
];

export const flashCompact = [
  preset({
    id: "fc-direct-flash",
    name: "Direct Flash",
    family: "Flash & Compact",
    blurb: "On-camera flash: hot skin, dark green shadows, gritty grain.",
    layers: [
      L("flash", { intensity: 0.85, falloff: 0.65, hue: 45, y: 0.42, blow: 0.4 }),
      L("grade", { exposure: -0.2, contrast: 0.2, saturation: -0.05, temperature: 0.05, tint: 0.12, shadows: -0.12, skinProtect: 0.85 }),
      L("splitTone", { shadowHue: 140, shadowAmt: 0.6, highHue: 30, highAmt: 0.35 }),
      L("lightLeak", { hue: 8, sat: 1, intensity: 0.45, x: 0.05, y: 0.6, size: 0.2, streak: 0, spread: 0.7, hue2: 20 }),
      L("vignette", { amount: 0.45, softness: 0.7 }),
      L("grain", { amount: 0.5, size: 1.5, chroma: 0.35, response: 0.7 }),
      L("dust", { density: 0.6, scratches: 0.2, strength: 0.6 }),
    ],
  }),
  preset({
    id: "fc-mirror-selfie",
    name: "Mirror Selfie",
    family: "Flash & Compact",
    blurb: "Tiny low-res CCD: warm, soft, noisy.",
    layers: [
      L("grade", { exposure: -0.1, contrast: 0.05, saturation: -0.05, temperature: 0.3, tint: 0.03, fade: 0.12, skinProtect: 0.7 }),
      L("diffuse", { radius: 10, amount: 0.3 }),
      L("lofi", { pixel: 2.5, noise: 0.45, chromaNoise: 0.4, blocks: 0.4, sharpen: 0.15, bayer: 0.3 }),
      L("bloom", { threshold: 0.55, intensity: 0.6, radius: 22, warmth: 0.5 }),
      L("vignette", { amount: 0.4, warmth: 0.3 }),
      L("grain", { amount: 0.3 }),
    ],
  }),
  preset({
    id: "fc-y2k-flash",
    name: "Y2K Flash",
    family: "Flash & Compact",
    blurb: "Cool, punchy compact with a hard blue-white flash.",
    layers: [
      L("grade", { exposure: 0.05, contrast: 0.3, saturation: 0.2, temperature: -0.15, tint: -0.05, highlights: 0.05, skinProtect: 0.6 }),
      L("flash", { intensity: 0.9, falloff: 0.8, hue: 210, y: 0.45, blow: 0.55 }),
      L("splitTone", { shadowHue: 230, shadowAmt: 0.3, highHue: 25, highAmt: 0.2 }),
      L("lofi", { pixel: 1.5, sharpen: 0.45, noise: 0.2, chromaNoise: 0.2, blocks: 0.2 }),
      L("chromatic", { amount: 0.2 }),
      L("vignette", { amount: 0.2 }),
      L("filmCurve", { shoulder: 0.1 }),
    ],
  }),
  preset({
    id: "fc-warm-compact",
    name: "Warm Compact",
    family: "Flash & Compact",
    blurb: "Friendly warm CCD colour, rich skin tones.",
    layers: [
      L("grade", { exposure: 0.05, contrast: 0.1, saturation: 0.2, temperature: 0.35, tint: -0.03, fade: 0.06, skinProtect: 0.8 }),
      L("filmCurve", { toe: 0.2, shoulder: 0.3 }),
      L("diffuse", { radius: 8, amount: 0.2 }),
      L("lofi", { pixel: 1.3, sharpen: 0.25, noise: 0.15, blocks: 0.15 }),
      L("bloom", { threshold: 0.65, intensity: 0.35, radius: 16, warmth: 0.5 }),
      L("vignette", { amount: 0.25, warmth: 0.3 }),
      L("grain", { amount: 0.15 }),
    ],
  }),
  preset({
    id: "fc-night-compact",
    name: "Night Compact",
    family: "Flash & Compact",
    blurb: "Slow-shutter night shot with flash, purple-blue cast.",
    layers: [
      L("blur", { radius: 4, angle: 8, mode: 1 }),
      L("flash", { intensity: 0.6, falloff: 0.7, hue: 220, y: 0.5, blow: 0.25 }),
      L("grade", { exposure: -0.15, contrast: 0.2, saturation: 0.05, temperature: -0.1, tint: -0.1, shadows: -0.05 }),
      L("splitTone", { shadowHue: 255, shadowAmt: 0.5, highHue: 35, highAmt: 0.35 }),
      L("bloom", { threshold: 0.5, intensity: 0.8, radius: 26, warmth: -0.2 }),
      L("lofi", { pixel: 1.8, noise: 0.45, chromaNoise: 0.45, blocks: 0.3, sharpen: 0.2 }),
      L("vignette", { amount: 0.35 }),
      L("grain", { amount: 0.3 }),
    ],
  }),
];

// "Button Phone": early phone-camera sensors. Original names, no brand marks.
export const buttonPhone = [
  preset({
    id: "bp-button-04",
    name: "Button Phone '04",
    family: "Button Phone",
    blurb: "Tiny VGA-era sensor: chunky pixels, JPEG blocks, washed colour.",
    layers: [
      L("lofi", { pixel: 4, levels: 0.25, noise: 0.45, chromaNoise: 0.5, blocks: 0.65, sharpen: 0.45, bayer: 0.6 }),
      L("grade", { exposure: 0.1, contrast: 0.15, saturation: -0.1, temperature: -0.12, tint: 0.08, fade: 0.1 }),
      L("bloom", { threshold: 0.55, intensity: 0.9, radius: 20, warmth: 0.2 }),
      L("chromatic", { amount: 0.2 }),
      L("vignette", { amount: 0.25 }),
    ],
  }),
  preset({
    id: "bp-slider-07",
    name: "Slider Phone '07",
    family: "Button Phone",
    blurb: "Better sensor, over-sharpened: halos, smudgy greens, JPEG crunch.",
    layers: [
      L("lofi", { pixel: 2.5, levels: 0.1, noise: 0.3, chromaNoise: 0.35, blocks: 0.5, sharpen: 0.7, bayer: 0.3 }),
      L("diffuse", { radius: 6, amount: 0.25 }),
      L("grade", { exposure: 0.0, contrast: 0.38, saturation: 0.5, temperature: 0.12, tint: -0.12 }),
      L("bloom", { threshold: 0.6, intensity: 0.6, radius: 16 }),
      L("chromatic", { amount: 0.25 }),
      L("vignette", { amount: 0.3, softness: 0.5 }),
      L("grain", { amount: 0.15 }),
    ],
  }),
  preset({
    id: "bp-vga-night",
    name: "VGA Night",
    family: "Button Phone",
    blurb: "Low light on a tiny sensor: heavy colour noise and banding.",
    layers: [
      L("grade", { exposure: -0.4, contrast: 0.4, saturation: -0.15, temperature: -0.3, tint: 0.2, shadows: 0.3 }),
      L("lofi", { pixel: 3, levels: 0.35, noise: 0.7, chromaNoise: 0.7, blocks: 0.5, sharpen: 0.3, bayer: 0.5 }),
      L("bloom", { threshold: 0.45, intensity: 1.0, radius: 22, warmth: -0.1 }),
      L("vignette", { amount: 0.45 }),
    ],
  }),
];

export { osd };
