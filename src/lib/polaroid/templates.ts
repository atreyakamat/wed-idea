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

export const TEMPLATES: readonly PolaroidTemplate[] = [elegantFloral, colourBorder, goaDoodle, giftBox];

export function getTemplate(id: string): PolaroidTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
