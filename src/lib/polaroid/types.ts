// A polaroid template is data, not hand-built markup: every position and
// size is in millimetres on the physical card, so the on-screen preview and
// the printed card come from the same numbers.

/** Mini polaroid card, 5.4 × 8.6 cm (Instax Mini size). */
export const CARD_WIDTH_MM = 54;
export const CARD_HEIGHT_MM = 86;

/** Named colour slots a couple can change; templates refer to these. */
export type Palette = {
  /** Card background. */
  paper: string;
  /** Main colour (gold foil, frame colour, ink lines…). */
  primary: string;
  /** Secondary colour (blossoms, hearts, bows…). */
  accent: string;
  /** Text and fine detail. */
  ink: string;
};

export type PaletteKey = keyof Palette;

/** A palette slot, or a fixed hex colour that never changes. */
export type ColorRef = PaletteKey | `#${string}`;

export type FontRole = "script" | "serif" | "hand" | "display";

/** Text the couple types in. "static" is fixed template text like "susegad". */
export type TextField = "names" | "date" | "place" | "static";

export type TextSlot = {
  field: TextField;
  /** Only for field "static". */
  value?: string;
  x: number;
  /** Baseline position. */
  y: number;
  font: FontRole;
  sizePt: number;
  /** Long names shrink down to this size before they would overflow. */
  minSizePt: number;
  maxWidthMm: number;
  color: ColorRef;
  anchor?: "start" | "middle" | "end";
  rotate?: number;
  italic?: boolean;
  uppercase?: boolean;
  letterSpacingEm?: number;
};

export type DecorationKind =
  | "leafSprig"
  | "blossom"
  | "flourish"
  | "wave"
  | "shell"
  | "palm"
  | "sun"
  | "heart"
  | "sparkle"
  | "band"
  | "bow";

export type Decoration = {
  kind: DecorationKind;
  /** Centre of the decoration. For "band", the top-left corner. */
  x: number;
  y: number;
  /** Size of the decoration's square box, in mm. */
  size: number;
  /** Width, height and corner radius, only for "band". */
  w?: number;
  h?: number;
  radius?: number;
  rotate?: number;
  /** Mirror horizontally. */
  flip?: boolean;
  color: ColorRef;
  /** Draw filled instead of as an outline (where the shape supports it). */
  filled?: boolean;
};

export type TemplateStyle = "elegant" | "colour-border" | "doodle" | "theme";

export type PolaroidTemplate = {
  id: string;
  name: string;
  style: TemplateStyle;
  description: string;
  defaultPalette: Palette;
  background: {
    color: ColorRef;
    /** Optional repeating pattern drawn over the background colour. */
    pattern?: { kind: "dots"; color: ColorRef; spacingMm: number; radiusMm: number };
  };
  photo: {
    x: number;
    y: number;
    w: number;
    h: number;
    stroke?: { color: ColorRef; widthMm: number };
  };
  decorations: Decoration[];
  text: TextSlot[];
};

/** What the couple fills in for their wedding. */
export type CardText = {
  names: string;
  date: string;
  place?: string;
};
