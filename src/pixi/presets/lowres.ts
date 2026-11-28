import { L, osd, preset, seg7 } from "./helpers";

// "0.1MP" cameras: they render on a true ~352 px grid (pixel 4.1 at the 1440 reference) and save at 1056 px,
// so every sensor pixel is exactly 3x3 on disk. Original recipes, no real device is being copied.
const GRID = 4.1;
const SIDE = 1056;

export const lowRes = [
  preset({
    id: "lr-vga-02",
    name: "Pixel Phone 0.1MP",
    family: "0.1MP",
    blurb: "Year-2002 camera phone: 0.1 megapixels, 20 colours a channel, loud JPEG blocks, green-cyan cast.",
    captureSide: SIDE,
    layers: [
      L("channelMix", { rGain: 0.92, gGain: 1.1, bGain: 0.95 }),
      L("grade", { exposure: 0.12, contrast: 0.12, saturation: -0.2, temperature: -0.12, tint: -0.18, fade: 0.1 }),
      L("lofi", { pixel: GRID, levels: 0.95, noise: 0.45, chromaNoise: 0.4, blocks: 0.75, sharpen: 0.55, bayer: 0.35 }),
      L("vignette", { amount: 0.25 }),
    ],
    overlays: [seg7("#ffb347", 0.96, 0.95, 0.024, "MM/DD/YY")],
  }),
  preset({
    id: "lr-flip-03",
    name: "Flip Cam 0.1MP",
    family: "0.1MP",
    blurb: "Warm, washed-out flip-phone cam with soft edges, magenta skin and chunky 3px pixels.",
    captureSide: SIDE,
    layers: [
      L("blur", { radius: 2 }),
      L("channelMix", { rGain: 1.1, gGain: 0.98, bGain: 0.86 }),
      L("grade", { exposure: 0.2, contrast: -0.18, saturation: -0.1, temperature: 0.3, tint: 0.12, fade: 0.28 }),
      L("lofi", { pixel: GRID, levels: 0.9, noise: 0.35, chromaNoise: 0.5, blocks: 0.6, sharpen: 0.2, bayer: 0.5 }),
      L("bloom", { threshold: 0.55, intensity: 0.8, radius: 22, warmth: 0.4 }),
      L("vignette", { amount: 0.4 }),
    ],
    overlays: [osd("#ffffff", [{ text: "0.1M", x: 0.04, y: 0.06, align: "left" }, { text: "FINE", x: 0.96, y: 0.06, align: "right" }], 0.04)],
  }),
  preset({
    id: "lr-webcam-00",
    name: "Desk Webcam 0.1MP",
    family: "0.1MP",
    blurb: "Early USB webcam: interlace lines, green-magenta cast, snowy noise and a slow shutter smear.",
    captureSide: SIDE,
    layers: [
      L("blur", { radius: 3 }),
      L("channelMix", { rGain: 1.0, gGain: 1.12, bGain: 1.05 }),
      L("grade", { exposure: -0.05, contrast: 0.25, saturation: -0.35, temperature: -0.25, tint: 0.2, fade: 0.2 }),
      L("lofi", { pixel: GRID, levels: 0.92, noise: 0.7, chromaNoise: 0.6, blocks: 0.5, sharpen: 0.35, bayer: 0.2 }),
      L("scanlines", { lines: 240, intensity: 0.28, bleed: 0.4 }),
      L("vignette", { amount: 0.45 }),
    ],
    overlays: [osd("#7dff8a", [{ text: "● LIVE", x: 0.05, y: 0.06, align: "left" }], 0.04)],
  }),
  preset({
    id: "lr-pocket-mono",
    name: "Pocket Mono 0.1MP",
    family: "0.1MP",
    blurb: "Pocket gadget camera: 6 shades of olive green, hard dither noise and 3px pixels.",
    captureSide: SIDE,
    layers: [
      L("grade", { exposure: 0.1, contrast: 0.5, saturation: -1, fade: 0.05 }),
      L("lofi", { pixel: GRID, levels: 0.99, noise: 0.5, chromaNoise: 0, blocks: 0.2, sharpen: 0.4, bayer: 0 }),
      L("splitTone", { shadowHue: 95, shadowAmt: 0.85, highHue: 75, highAmt: 0.7, balance: 0 }),
      L("vignette", { amount: 0.3 }),
    ],
  }),
];
