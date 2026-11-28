import { L, osd, preset, seg7 } from "./helpers";
import type { OverlaySpec } from "@/pixi/engine/types";

const mono = (color: string, lines: { text: string; x: number; y: number; align?: "left" | "right" | "center" }[], size = 0.03): OverlaySpec =>
  osd(color, lines, size);

export const fisheye = [
  preset({
    id: "fe-skate",
    name: "Skate Fisheye",
    family: "Fisheye",
    blurb: "Hard barrel lens, punchy contrast, gritty grain, stamp in the corner.",
    layers: [
      L("distort", { fisheye: 1, zoom: 0.92 }),
      L("grade", { exposure: 0.05, contrast: 0.3, saturation: 0.25, temperature: 0.05, highlights: -0.1 }),
      L("grain", { amount: 0.35, size: 1.3 }),
      L("chromatic", { amount: 0.5, lateral: 1 }),
      L("vignette", { amount: 0.5, softness: 0.5 }),
    ],
    overlays: [seg7("#ffffff", 0.94, 0.94, 0.026, "MM.DD.'YY")],
  }),
  preset({
    id: "fe-peephole",
    name: "Peephole",
    family: "Fisheye",
    aspect: 1,
    blurb: "Full circle fisheye like a door viewer: tiny round world, dark corners.",
    layers: [
      L("distort", { fisheye: 1, zoom: 0.78, circle: 1 }),
      L("grade", { contrast: 0.2, saturation: -0.1, temperature: -0.08, fade: 0.1 }),
      L("diffuse", { radius: 6, amount: 0.3 }),
      L("lofi", { pixel: 1.6, noise: 0.25, sharpen: 0.2 }),
      L("vignette", { amount: 0.4 }),
    ],
  }),
  preset({
    id: "fe-wide-compact",
    name: "Wide Compact",
    family: "Fisheye",
    blurb: "Mild wide-angle bend, bright flash-lit friends, orange date.",
    layers: [
      L("distort", { fisheye: 0.45, zoom: 1.05 }),
      L("flash", { intensity: 0.45, falloff: 0.8, blow: 0.35 }),
      L("grade", { exposure: 0.1, contrast: 0.2, saturation: 0.15, temperature: 0.1 }),
      L("grain", { amount: 0.25 }),
      L("vignette", { amount: 0.35 }),
    ],
    overlays: [seg7("#ff9a2e")],
  }),
  preset({
    id: "fe-disposable-bubble",
    name: "Bubble Lens",
    family: "Fisheye",
    blurb: "Soft dreamy bubble: strong bend, bloom, pastel cast.",
    layers: [
      L("distort", { fisheye: 0.9, zoom: 0.9 }),
      L("diffuse", { radius: 10, amount: 0.4 }),
      L("grade", { exposure: 0.12, contrast: 0.05, saturation: 0.1, temperature: -0.05, tint: 0.12, fade: 0.15 }),
      L("bloom", { threshold: 0.55, intensity: 0.9, radius: 24, warmth: 0.1 }),
      L("vignette", { amount: 0.45 }),
    ],
  }),
];

export const disposable = [
  preset({
    id: "dp-flash",
    name: "Disposable Flash",
    family: "Disposable",
    blurb: "Hard on-camera flash: bright subject, dark background, warm greens.",
    layers: [
      L("flash", { intensity: 0.8, falloff: 0.9, hue: 40, blow: 0.45 }),
      L("grade", { exposure: -0.05, contrast: 0.3, saturation: 0.2, temperature: 0.08, tint: -0.05 }),
      L("grain", { amount: 0.45, size: 1.4, chroma: 0.4 }),
      L("dust", { density: 0.3, scratches: 0.15 }),
      L("vignette", { amount: 0.5 }),
    ],
    overlays: [seg7("#ff8a1e", 0.93, 0.92)],
  }),
  preset({
    id: "dp-daylight",
    name: "Disposable Daylight",
    family: "Disposable",
    blurb: "Plastic lens in sun: warm, a little soft, contrasty, saturated reds.",
    layers: [
      L("grade", { exposure: 0.05, contrast: 0.4, saturation: 0.5, temperature: 0.22, tint: -0.1, highlights: -0.1 }),
      L("diffuse", { radius: 6, amount: 0.2 }),
      L("grain", { amount: 0.4, size: 1.3 }),
      L("lightLeak", { hue: 18, intensity: 0.35, x: 1, y: 0.2 }),
      L("vignette", { amount: 0.4 }),
    ],
  }),
  preset({
    id: "dp-beach",
    name: "Boardwalk Roll",
    family: "Disposable",
    blurb: "Cross-processed: magenta shadows, aqua highlights, saturated.",
    layers: [
      L("grade", { exposure: 0.1, contrast: 0.3, saturation: 0.35, temperature: -0.05, tint: 0.3, fade: 0.1 }),
      L("splitTone", { shadowHue: 300, shadowAmt: 0.4, highHue: 175, highAmt: 0.35 }),
      L("grain", { amount: 0.35 }),
      L("flare", { x: 0.85, y: 0.15, intensity: 0.5, hue: 40, ghosts: 0.2 }),
      L("vignette", { amount: 0.3 }),
    ],
  }),
  preset({
    id: "dp-party",
    name: "Party Strobe",
    family: "Disposable",
    blurb: "Late-night flash: blown faces, red-orange backdrop, harsh edges.",
    layers: [
      L("flash", { intensity: 0.95, falloff: 1.1, hue: 20, blow: 0.6 }),
      L("grade", { contrast: 0.35, saturation: 0.35, temperature: 0.25, tint: 0.1, shadows: -0.1 }),
      L("grain", { amount: 0.5, size: 1.5 }),
      L("vignette", { amount: 0.55 }),
    ],
    overlays: [seg7("#ff5a1e", 0.93, 0.92)],
  }),
];

export const crtTv = [
  preset({
    id: "tv-crt",
    name: "Old CRT Screen",
    family: "CRT & TV",
    aspect: 4 / 3,
    blurb: "Curved glass, scanlines, glow, slight colour fringe.",
    layers: [
      L("distort", { fisheye: 0.35, zoom: 1.0 }),
      L("scanlines", { lines: 360, intensity: 0.4, bleed: 0.4 }),
      L("grade", { contrast: 0.2, saturation: 0.25, temperature: -0.05 }),
      L("bloom", { threshold: 0.5, intensity: 1.0, radius: 20 }),
      L("chromatic", { amount: 0.5 }),
      L("vignette", { amount: 0.55, roundness: 0.8 }),
    ],
  }),
  preset({
    id: "tv-static",
    name: "Dead Channel",
    family: "CRT & TV",
    aspect: 4 / 3,
    blurb: "Rolling bars and tearing, noisy grey-blue, signal almost gone.",
    layers: [
      L("scanlines", { lines: 300, intensity: 0.35, glitch: 1, bleed: 0.8, roll: 0.8 }),
      L("grade", { contrast: 0.1, saturation: -0.4, temperature: -0.25 }),
      L("lofi", { pixel: 1.5, noise: 0.7, chromaNoise: 0.4, blocks: 0.2 }),
      L("chromatic", { amount: 0.6, lateral: 1 }),
      L("vignette", { amount: 0.4 }),
    ],
    overlays: [mono("#7dff7d", [{ text: "CH 03", x: 0.06, y: 0.1 }, { text: "NO SIGNAL", x: 0.5, y: 0.5, align: "center" }], 0.05)],
  }),
  preset({
    id: "tv-arcade",
    name: "Arcade Monitor",
    family: "CRT & TV",
    aspect: 4 / 3,
    blurb: "Saturated, bright pixels with strong lines and glowing highlights.",
    layers: [
      L("lofi", { pixel: 3, levels: 0.3 }),
      L("distort", { fisheye: 0.25, zoom: 1.0 }),
      L("scanlines", { lines: 240, intensity: 0.5 }),
      L("grade", { contrast: 0.3, saturation: 0.6 }),
      L("bloom", { threshold: 0.4, intensity: 1.2, radius: 18 }),
      L("vignette", { amount: 0.5 }),
    ],
  }),
];

export const security = [
  preset({
    id: "sc-cctv-night",
    name: "CCTV Night",
    family: "Security Cam",
    aspect: 16 / 9,
    blurb: "Night-vision green, wide lens, noisy, camera ID and clock.",
    layers: [
      L("distort", { fisheye: 0.5, zoom: 1.05 }),
      L("grade", { exposure: 0.15, contrast: 0.3, saturation: -1 }),
      L("channelMix", { rGain: 0.5, gGain: 1.1, bGain: 0.5 }),
      L("lofi", { pixel: 2.2, noise: 0.6, blocks: 0.4, sharpen: 0.4 }),
      L("scanlines", { lines: 360, intensity: 0.2, roll: 0.2 }),
      L("vignette", { amount: 0.5 }),
    ],
    overlays: [
      mono("#d9ffd9", [
        { text: "CAM 04  NIGHT", x: 0.04, y: 0.08 },
        { text: "MM/DD/YYYY hh:mm:ss", x: 0.04, y: 0.94 },
        { text: "REC", x: 0.94, y: 0.08, align: "right" },
      ], 0.04),
    ],
  }),
  preset({
    id: "sc-lobby",
    name: "Lobby Cam",
    family: "Security Cam",
    aspect: 16 / 9,
    blurb: "Flat black-and-white, overhead wide angle, compression blocks.",
    layers: [
      L("distort", { fisheye: 0.6, zoom: 1.08 }),
      L("grade", { contrast: 0.15, saturation: -1, fade: 0.12 }),
      L("lofi", { pixel: 2.5, noise: 0.35, blocks: 0.7, sharpen: 0.3 }),
      L("vignette", { amount: 0.4 }),
    ],
    overlays: [
      mono("#ffffff", [
        { text: "LOBBY 2", x: 0.04, y: 0.08 },
        { text: "DOW MM-DD-YYYY hh:mm:ss", x: 0.04, y: 0.94 },
      ], 0.036),
    ],
  }),
];

export const webcam = [
  preset({
    id: "wc-2005",
    name: "Webcam 2005",
    family: "Webcam",
    aspect: 4 / 3,
    blurb: "320-pixel sensor: soft blocks, blue-white balance, harsh monitor glow.",
    layers: [
      L("lofi", { pixel: 4, levels: 0.3, noise: 0.5, chromaNoise: 0.5, blocks: 0.7, sharpen: 0.25 }),
      L("grade", { exposure: 0.15, contrast: 0.1, saturation: -0.1, temperature: -0.3, tint: 0.1 }),
      L("bloom", { threshold: 0.5, intensity: 0.9, radius: 22, warmth: -0.3 }),
      L("vignette", { amount: 0.3 }),
    ],
  }),
  preset({
    id: "wc-chat-cam",
    name: "Chat Room Cam",
    family: "Webcam",
    aspect: 4 / 3,
    blurb: "Late-night lamp glow: orange face, dark room, laggy chroma.",
    layers: [
      L("lofi", { pixel: 3, levels: 0.2, noise: 0.6, chromaNoise: 0.6, blocks: 0.5 }),
      L("grade", { exposure: 0.1, contrast: 0.15, saturation: 0.1, temperature: 0.3, tint: 0.08, shadows: -0.15 }),
      L("scanlines", { lines: 480, intensity: 0.1, bleed: 0.5 }),
      L("vignette", { amount: 0.5 }),
    ],
  }),
];

export const super8 = [
  preset({
    id: "s8-warm",
    name: "Super 8 Summer",
    family: "Super 8",
    aspect: 4 / 3,
    blurb: "Home-movie warmth: gate weave, flicker, amber leaks and dust.",
    layers: [
      L("grade", { exposure: 0.05, contrast: 0.15, saturation: 0.1, temperature: 0.3, fade: 0.18 }),
      L("texture", { amount: 0.3, weave: 0.6 }),
      L("grain", { amount: 0.55, size: 1.6 }),
      L("lightLeak", { hue: 22, intensity: 0.5, x: 1, y: 0.5, streak: 0.5 }),
      L("dust", { density: 0.7, scratches: 0.5 }),
      L("vignette", { amount: 0.55 }),
    ],
  }),
  preset({
    id: "s8-faded",
    name: "Faded Reel",
    family: "Super 8",
    aspect: 4 / 3,
    blurb: "Sun-bleached print: magenta cast, low contrast, soft edges.",
    layers: [
      L("grade", { exposure: 0.2, contrast: -0.1, saturation: -0.15, temperature: 0.1, tint: 0.25, fade: 0.3 }),
      L("diffuse", { radius: 8, amount: 0.3 }),
      L("grain", { amount: 0.5, size: 1.5 }),
      L("dust", { density: 0.6, scratches: 0.4 }),
      L("vignette", { amount: 0.5 }),
    ],
  }),
  preset({
    id: "s8-night",
    name: "Cine Night",
    family: "Super 8",
    aspect: 4 / 3,
    blurb: "Under-exposed tungsten: deep teal shadows, glowing practical lights.",
    layers: [
      L("grade", { exposure: -0.2, contrast: 0.25, saturation: 0.05, temperature: -0.1 }),
      L("splitTone", { shadowHue: 200, shadowAmt: 0.45, highHue: 38, highAmt: 0.4 }),
      L("bloom", { threshold: 0.5, intensity: 1.1, radius: 26, warmth: 0.5 }),
      L("grain", { amount: 0.6, size: 1.7 }),
      L("vignette", { amount: 0.6 }),
    ],
  }),
];

export const y2k = [
  preset({
    id: "y2k-chrome",
    name: "Y2K Chrome",
    family: "Y2K",
    blurb: "Icy blue-silver, hard contrast, star glints and glossy bloom.",
    layers: [
      L("grade", { exposure: 0.15, contrast: 0.3, saturation: -0.1, temperature: -0.35, tint: 0.05 }),
      L("bloom", { threshold: 0.45, intensity: 1.2, radius: 24, warmth: -0.4 }),
      L("flare", { x: 0.2, y: 0.2, intensity: 0.8, hue: 200, ghosts: 0.6, streakLen: 0.8, angle: 45 }),
      L("chromatic", { amount: 0.25 }),
      L("vignette", { amount: 0.25 }),
    ],
  }),
  preset({
    id: "y2k-candy",
    name: "Pastel Candy",
    family: "Y2K",
    blurb: "Pink-lilac haze, lifted blacks, creamy skin, sparkle.",
    layers: [
      L("grade", { exposure: 0.25, contrast: -0.1, saturation: 0.3, temperature: -0.12, tint: 0.5, fade: 0.28, skinProtect: 0.6 }),
      L("diffuse", { radius: 12, amount: 0.45 }),
      L("bloom", { threshold: 0.5, intensity: 1.0, radius: 26, warmth: 0.2 }),
      L("flare", { x: 0.8, y: 0.15, intensity: 0.6, hue: 320, ghosts: 0.4 }),
      L("vignette", { amount: 0.2 }),
    ],
  }),
  preset({
    id: "y2k-aqua",
    name: "Aqua Pop",
    family: "Y2K",
    blurb: "Saturated cyan-magenta, glossy highlights, digital sharpness.",
    layers: [
      L("lofi", { pixel: 1.6, sharpen: 0.5, noise: 0.15 }),
      L("grade", { exposure: 0.1, contrast: 0.2, saturation: 0.5, temperature: -0.2, tint: 0.25 }),
      L("bloom", { threshold: 0.55, intensity: 0.9, radius: 20, warmth: -0.2 }),
      L("chromatic", { amount: 0.35 }),
    ],
  }),
];
