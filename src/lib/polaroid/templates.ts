import type { PolaroidTemplate } from "./types";

// Starter templates. Original designs in four styles: elegant floral,
// colour border, doodle and a themed frame. Coordinates are mm on the
// 54 × 86 mm card; (0, 0) is the top-left corner.

const elegantFloral: PolaroidTemplate = {
  id: "elegant-floral",
  name: "Ivory Bloom",
  style: "elegant",
  description: "Ivory card, gold leaf sprigs and blush blossoms, names in gold script.",
  defaultPalette: { paper: "#fbf7ef", primary: "#a8834a", accent: "#e3b7ad", ink: "#5b4a36" },
  background: { color: "paper" },
  photo: { x: 4, y: 4.5, w: 46, h: 60 },
  decorations: [
    { kind: "leafSprig", x: 8.5, y: 76, size: 10, rotate: -35, color: "primary" },
    { kind: "leafSprig", x: 45.5, y: 76, size: 10, rotate: 35, flip: true, color: "primary" },
    { kind: "blossom", x: 5.8, y: 71.2, size: 3.6, color: "accent", filled: true },
    { kind: "blossom", x: 48.2, y: 71.2, size: 3.6, color: "accent", filled: true },
    { kind: "blossom", x: 9.6, y: 82.4, size: 2.4, color: "accent", filled: true },
    { kind: "blossom", x: 44.4, y: 82.4, size: 2.4, color: "accent", filled: true },
    { kind: "sparkle", x: 27, y: 68.6, size: 2, color: "primary", filled: true },
  ],
  text: [
    { field: "names", x: 27, y: 76.4, font: "script", sizePt: 17, minSizePt: 10, maxWidthMm: 30, color: "primary", anchor: "middle" },
    { field: "date", x: 27, y: 81.8, font: "serif", sizePt: 5.5, minSizePt: 4.5, maxWidthMm: 26, color: "ink", anchor: "middle", uppercase: true, letterSpacingEm: 0.28 },
  ],
};

const colourBorder: PolaroidTemplate = {
  id: "colour-border",
  name: "Heirloom Frame",
  style: "colour-border",
  description: "A rich colour frame with gold corner flourishes, date and place in fine serif.",
  defaultPalette: { paper: "#7b1e2c", primary: "#7b1e2c", accent: "#d8b26a", ink: "#f6ead8" },
  background: { color: "paper" },
  photo: { x: 4.5, y: 4.5, w: 45, h: 61, stroke: { color: "accent", widthMm: 0.25 } },
  decorations: [
    { kind: "flourish", x: 8.4, y: 8.4, size: 8, color: "accent" },
    { kind: "flourish", x: 45.6, y: 61.6, size: 8, rotate: 180, color: "accent" },
    { kind: "sparkle", x: 27, y: 68.8, size: 2.2, color: "accent", filled: true },
  ],
  text: [
    { field: "names", x: 27, y: 73.6, font: "serif", sizePt: 9, minSizePt: 6.5, maxWidthMm: 42, color: "ink", anchor: "middle", italic: true },
    { field: "date", x: 27, y: 78.6, font: "serif", sizePt: 6, minSizePt: 5, maxWidthMm: 40, color: "ink", anchor: "middle", letterSpacingEm: 0.12 },
    { field: "place", x: 27, y: 82.4, font: "serif", sizePt: 6, minSizePt: 5, maxWidthMm: 40, color: "accent", anchor: "middle", italic: true },
  ],
};

const goaDoodle: PolaroidTemplate = {
  id: "goa-doodle",
  name: "Susegad Doodle",
  style: "doodle",
  description: "White card with hand-drawn Goa doodles (sun, waves, shells, palms) around a fine black frame.",
  defaultPalette: { paper: "#ffffff", primary: "#1f1d1b", accent: "#e8869d", ink: "#1f1d1b" },
  background: { color: "paper" },
  photo: { x: 6.5, y: 7, w: 41, h: 55, stroke: { color: "primary", widthMm: 0.45 } },
  decorations: [
    { kind: "sun", x: 4.4, y: 4.4, size: 5.4, color: "primary" },
    { kind: "wave", x: 27, y: 3.6, size: 9, color: "primary" },
    { kind: "sparkle", x: 41, y: 3.4, size: 2.8, color: "primary" },
    { kind: "shell", x: 50.6, y: 11.5, size: 4.6, rotate: 18, color: "primary" },
    { kind: "palm", x: 50.6, y: 50, size: 5.4, color: "primary" },
    { kind: "sparkle", x: 3.4, y: 52, size: 2.6, color: "primary" },
    { kind: "heart", x: 50.6, y: 31, size: 3.2, color: "accent", filled: true },
    { kind: "shell", x: 7, y: 66.5, size: 3.8, rotate: -20, color: "primary" },
    { kind: "heart", x: 27, y: 68.2, size: 4.4, color: "accent", filled: true },
    { kind: "wave", x: 47, y: 82.6, size: 7, color: "primary" },
  ],
  text: [
    { field: "static", value: "susegad", x: 3.9, y: 34.5, font: "hand", sizePt: 8.5, minSizePt: 8.5, maxWidthMm: 20, color: "primary", anchor: "middle", rotate: -90 },
    { field: "names", x: 27, y: 76.2, font: "hand", sizePt: 13, minSizePt: 8, maxWidthMm: 40, color: "ink", anchor: "middle" },
    { field: "date", x: 27, y: 81.6, font: "hand", sizePt: 7, minSizePt: 6, maxWidthMm: 30, color: "ink", anchor: "middle" },
  ],
};

const giftBox: PolaroidTemplate = {
  id: "gift-box",
  name: "Wedding Gift",
  style: "theme",
  description: "The card becomes a wrapped gift: polka-dot paper, a ribbon band and a gold bow.",
  defaultPalette: { paper: "#ffffff", primary: "#d9434f", accent: "#f2c14e", ink: "#3b2a2a" },
  background: { color: "primary", pattern: { kind: "dots", color: "paper", spacingMm: 3.2, radiusMm: 0.38 } },
  photo: { x: 4.5, y: 4.5, w: 45, h: 52, stroke: { color: "paper", widthMm: 0.9 } },
  decorations: [
    { kind: "band", x: 0, y: 60.5, w: 54, h: 8.5, size: 0, color: "ink" },
    { kind: "bow", x: 27, y: 64.75, size: 11, color: "accent", filled: true },
    { kind: "band", x: 8, y: 71.5, w: 38, h: 12.5, radius: 1.6, size: 0, color: "paper" },
  ],
  text: [
    { field: "names", x: 27, y: 78.2, font: "display", sizePt: 11, minSizePt: 7, maxWidthMm: 34, color: "primary", anchor: "middle", italic: true },
    { field: "date", x: 27, y: 82.2, font: "serif", sizePt: 5.5, minSizePt: 4.5, maxWidthMm: 32, color: "ink", anchor: "middle", letterSpacingEm: 0.2, uppercase: true },
  ],
};

// Goa's Portuguese-era blue-and-white tiles. The 6.75 mm tile divides the
// 54 mm card into 8 columns, and the photo sits on the tile grid.
const azulejo: PolaroidTemplate = {
  id: "azulejo",
  name: "Azulejo Tiles",
  style: "heritage",
  description: "Blue-and-white Goan tiles all around, with a tile-framed label for your names.",
  defaultPalette: { paper: "#f7f3ea", primary: "#1f4e8c", accent: "#c79a3b", ink: "#1f3557" },
  background: { color: "paper", pattern: { kind: "tiles", color: "primary", spacingMm: 6.75 } },
  photo: { x: 6.75, y: 6.75, w: 40.5, h: 54, stroke: { color: "paper", widthMm: 1 } },
  decorations: [
    { kind: "band", x: 5.5, y: 63.6, w: 43, h: 18.4, radius: 1.2, size: 0, color: "paper", outline: { color: "primary", widthMm: 0.35 } },
    { kind: "dot", x: 20, y: 76.6, size: 0.8, color: "accent" },
    { kind: "dot", x: 34, y: 76.6, size: 0.8, color: "accent" },
  ],
  text: [
    { field: "names", x: 27, y: 72.4, font: "display", sizePt: 13, minSizePt: 8, maxWidthMm: 38, color: "primary", anchor: "middle", italic: true },
    { field: "date", x: 27, y: 77.4, font: "serif", sizePt: 5.5, minSizePt: 4.5, maxWidthMm: 12, color: "ink", anchor: "middle", letterSpacingEm: 0.12 },
    { field: "place", x: 27, y: 80.6, font: "serif", sizePt: 5.5, minSizePt: 4.5, maxWidthMm: 36, color: "accent", anchor: "middle", italic: true },
  ],
};

// A destination-wedding "ticket" to Goa.
const boardingPass: PolaroidTemplate = {
  id: "boarding-pass",
  name: "Boarding Pass",
  style: "theme",
  description: "A boarding pass to the wedding: passengers, date, destination and a barcode.",
  defaultPalette: { paper: "#fffdf8", primary: "#0f5f6b", accent: "#e9795a", ink: "#20313a" },
  background: { color: "paper" },
  photo: { x: 4, y: 10, w: 46, h: 46 },
  decorations: [
    { kind: "band", x: 0, y: 0, w: 54, h: 7.2, size: 0, color: "primary" },
    { kind: "plane", x: 47.4, y: 3.6, size: 4.6, color: "#ffffff" },
    { kind: "dashedLine", x: 2.5, y: 59.4, w: 49, h: 0, size: 0, color: "ink", opacity: 0.6 },
    { kind: "dot", x: 0, y: 59.4, size: 3.4, color: "#e8e2d9" },
    { kind: "dot", x: 54, y: 59.4, size: 3.4, color: "#e8e2d9" },
    { kind: "barcode", x: 5, y: 80, w: 44, h: 3.6, size: 0, color: "ink" },
  ],
  text: [
    { field: "static", value: "BOARDING PASS", x: 4.5, y: 4.9, font: "sans", sizePt: 5, minSizePt: 5, maxWidthMm: 34, color: "#ffffff", letterSpacingEm: 0.3 },
    { field: "static", value: "PASSENGERS", x: 5, y: 64.2, font: "sans", sizePt: 3.6, minSizePt: 3.6, maxWidthMm: 30, color: "accent", letterSpacingEm: 0.25 },
    { field: "names", x: 5, y: 69, font: "display", sizePt: 10, minSizePt: 7, maxWidthMm: 44, color: "ink", italic: true },
    { field: "static", value: "DATE", x: 5, y: 73.4, font: "sans", sizePt: 3.6, minSizePt: 3.6, maxWidthMm: 20, color: "accent", letterSpacingEm: 0.25 },
    { field: "date", x: 5, y: 77.2, font: "mono", sizePt: 5.6, minSizePt: 4.2, maxWidthMm: 22, color: "ink" },
    { field: "static", value: "DESTINATION", x: 29, y: 73.4, font: "sans", sizePt: 3.6, minSizePt: 3.6, maxWidthMm: 20, color: "accent", letterSpacingEm: 0.25 },
    { field: "place", x: 29, y: 77.2, font: "mono", sizePt: 5.6, minSizePt: 4.2, maxWidthMm: 20, color: "ink" },
  ],
};

// Henna paisleys and a mandala, for mehendi and haldi functions.
const mehendi: PolaroidTemplate = {
  id: "mehendi",
  name: "Mehendi",
  style: "heritage",
  description: "Henna-style paisleys and mandalas in warm terracotta on cream.",
  defaultPalette: { paper: "#fbf1e4", primary: "#9a3b1e", accent: "#c9973f", ink: "#6b2a14" },
  background: { color: "paper" },
  photo: { x: 5, y: 5, w: 44, h: 56, stroke: { color: "primary", widthMm: 0.3 } },
  decorations: [
    { kind: "mandala", x: 5, y: 5, size: 6.6, color: "primary" },
    { kind: "mandala", x: 49, y: 5, size: 6.6, color: "primary" },
    { kind: "paisley", x: 9, y: 74, size: 10, rotate: -20, color: "primary" },
    { kind: "paisley", x: 45, y: 74, size: 10, rotate: 20, flip: true, color: "primary" },
    ...[15, 19, 23, 27, 31, 35, 39].map((x) => ({ kind: "dot" as const, x, y: 64.4, size: 0.7, color: "accent" as const })),
    { kind: "mandala", x: 27, y: 83.6, size: 3.6, color: "accent" },
  ],
  text: [
    { field: "names", x: 27, y: 74.6, font: "script", sizePt: 15, minSizePt: 9, maxWidthMm: 26, color: "primary", anchor: "middle" },
    { field: "date", x: 27, y: 79.6, font: "serif", sizePt: 5.5, minSizePt: 4.5, maxWidthMm: 24, color: "ink", anchor: "middle", uppercase: true, letterSpacingEm: 0.25 },
  ],
};

// Washi tape and a slightly tilted photo, like a page from a scrapbook.
const scrapbook: PolaroidTemplate = {
  id: "scrapbook",
  name: "Scrapbook",
  style: "doodle",
  description: "A tilted photo held on with washi tape, handwritten names and little doodles.",
  defaultPalette: { paper: "#efe6d6", primary: "#2b2b2b", accent: "#9ccfc4", ink: "#2b2b2b" },
  background: { color: "paper" },
  photo: { x: 6, y: 8, w: 42, h: 54, rotate: -2.2, stroke: { color: "#ffffff", widthMm: 1.4 } },
  decorations: [
    { kind: "tape", x: 8.8, y: 8.6, size: 13, rotate: -38, color: "accent", opacity: 0.85 },
    { kind: "tape", x: 45.6, y: 7.2, size: 13, rotate: 36, color: "#f2b5c3", opacity: 0.85 },
    { kind: "heart", x: 7.4, y: 70.4, size: 3.8, color: "primary" },
    { kind: "sparkle", x: 46.6, y: 68.4, size: 3.4, color: "primary" },
    { kind: "sparkle", x: 49.6, y: 72.6, size: 1.8, color: "primary", filled: true },
  ],
  text: [
    { field: "names", x: 27, y: 75.4, font: "hand", sizePt: 14, minSizePt: 8, maxWidthMm: 34, color: "ink", anchor: "middle", rotate: -2 },
    { field: "date", x: 27, y: 81.2, font: "hand", sizePt: 7.5, minSizePt: 6, maxWidthMm: 30, color: "ink", anchor: "middle", rotate: -2 },
  ],
};

// A frame of film with sprocket holes and an orange camera date stamp.
const retroFilm: PolaroidTemplate = {
  id: "retro-film",
  name: "Retro Film",
  style: "retro",
  description: "Black film frame with sprocket holes and an orange date stamp on the photo.",
  defaultPalette: { paper: "#141414", primary: "#f3efe6", accent: "#ff8a1f", ink: "#f3efe6" },
  background: { color: "paper" },
  photo: { x: 7.5, y: 6, w: 39, h: 56 },
  decorations: [
    { kind: "sprockets", x: 2.1, y: 2.5, w: 2.4, h: 81, size: 0, color: "primary", opacity: 0.9 },
    { kind: "sprockets", x: 49.5, y: 2.5, w: 2.4, h: 81, size: 0, color: "primary", opacity: 0.9 },
  ],
  text: [
    { field: "date", x: 45, y: 60.2, font: "mono", sizePt: 5.2, minSizePt: 4, maxWidthMm: 22, color: "accent", anchor: "end" },
    { field: "static", value: "12A", x: 7.6, y: 66, font: "mono", sizePt: 3.6, minSizePt: 3.6, maxWidthMm: 8, color: "accent" },
    { field: "static", value: "13 ▸", x: 46.4, y: 66, font: "mono", sizePt: 3.6, minSizePt: 3.6, maxWidthMm: 8, color: "accent", anchor: "end" },
    { field: "names", x: 27, y: 73.2, font: "sans", sizePt: 6.5, minSizePt: 5, maxWidthMm: 38, color: "ink", anchor: "middle", uppercase: true, letterSpacingEm: 0.28 },
    { field: "place", x: 27, y: 78.6, font: "serif", sizePt: 6.5, minSizePt: 5, maxWidthMm: 36, color: "primary", anchor: "middle", italic: true },
  ],
};

export const TEMPLATES: readonly PolaroidTemplate[] = [
  elegantFloral,
  colourBorder,
  goaDoodle,
  giftBox,
  azulejo,
  boardingPass,
  mehendi,
  scrapbook,
  retroFilm,
];

export function getTemplate(id: string): PolaroidTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
