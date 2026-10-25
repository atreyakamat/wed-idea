import type { FontRole, TextSlot } from "./types";

export const MM_PER_PT = 25.4 / 72;

// Average glyph width as a fraction of the font size. Measured in Chromium
// on sample names (Great Vibes 0.43, Cormorant 0.42, Caveat 0.38,
// Instrument Serif 0.40), then padded ~8% so text never overflows.
const AVG_CHAR_WIDTH_EM: Record<FontRole, number> = {
  script: 0.46,
  serif: 0.46,
  hand: 0.42,
  display: 0.43,
  sans: 0.56,
  mono: 0.62,
};

export function estimateTextWidthMm(
  text: string,
  font: FontRole,
  sizePt: number,
  letterSpacingEm = 0,
): number {
  const chars = [...text].length;
  if (chars === 0) return 0;
  const sizeMm = sizePt * MM_PER_PT;
  const glyphs = chars * sizeMm * AVG_CHAR_WIDTH_EM[font];
  const spacing = Math.max(0, chars - 1) * sizeMm * letterSpacingEm;
  return glyphs + spacing;
}

/**
 * Font size (pt) that fits the text into the slot's width, shrinking from
 * the slot's size down to its minimum. If even the minimum is too wide, the
 * renderer squeezes the text with textLength as a last resort.
 */
export function fitFontSize(
  text: string,
  slot: Pick<TextSlot, "font" | "sizePt" | "minSizePt" | "maxWidthMm" | "letterSpacingEm">,
): { sizePt: number; overflows: boolean } {
  const width = estimateTextWidthMm(text, slot.font, slot.sizePt, slot.letterSpacingEm);
  if (width <= slot.maxWidthMm) return { sizePt: slot.sizePt, overflows: false };

  const scaled = slot.sizePt * (slot.maxWidthMm / width);
  const sizePt = Math.max(slot.minSizePt, Math.floor(scaled * 10) / 10);
  const overflows =
    estimateTextWidthMm(text, slot.font, sizePt, slot.letterSpacingEm) > slot.maxWidthMm;
  return { sizePt, overflows };
}
