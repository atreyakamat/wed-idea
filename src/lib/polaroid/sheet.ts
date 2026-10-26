import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "./types";

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export type SheetSlot = {
  /** Top-left corner of the slot on the sheet. */
  x: number;
  y: number;
  /** Slot size on the sheet (already swapped when rotated). */
  w: number;
  h: number;
  /** Card turned 90° to fit more per sheet. */
  rotated: boolean;
};

export type SheetLayout = {
  pageWidth: number;
  pageHeight: number;
  slots: SheetSlot[];
  /** Positions of every vertical and horizontal cut, for crop marks. */
  cutsX: number[];
  cutsY: number[];
};

type Options = {
  pageWidth?: number;
  pageHeight?: number;
  cardWidth?: number;
  cardHeight?: number;
  /** Space between cards, for the trimmer blade. */
  gapMm?: number;
  /** Smallest margin the printer can print into (L3210: 3 mm on A4). */
  minMarginMm?: number;
};

function grid(
  pageW: number,
  pageH: number,
  w: number,
  h: number,
  gap: number,
  margin: number,
) {
  const cols = Math.floor((pageW - 2 * margin + gap) / (w + gap));
  const rows = Math.floor((pageH - 2 * margin + gap) / (h + gap));
  return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
}

/**
 * Lays out as many cards as fit on one sheet, trying the cards upright and
 * turned sideways, and centring the grid on the page.
 */
export function computeSheetLayout(options: Options = {}): SheetLayout {
  const pageWidth = options.pageWidth ?? A4_WIDTH_MM;
  const pageHeight = options.pageHeight ?? A4_HEIGHT_MM;
  const cardW = options.cardWidth ?? CARD_WIDTH_MM;
  const cardH = options.cardHeight ?? CARD_HEIGHT_MM;
  const gap = options.gapMm ?? 3;
  const margin = options.minMarginMm ?? 3;

  const upright = grid(pageWidth, pageHeight, cardW, cardH, gap, margin);
  const sideways = grid(pageWidth, pageHeight, cardH, cardW, gap, margin);
  const rotated = sideways.cols * sideways.rows > upright.cols * upright.rows;
  const { cols, rows } = rotated ? sideways : upright;
  const w = rotated ? cardH : cardW;
  const h = rotated ? cardW : cardH;

  const usedW = cols * w + Math.max(0, cols - 1) * gap;
  const usedH = rows * h + Math.max(0, rows - 1) * gap;
  const left = (pageWidth - usedW) / 2;
  const top = (pageHeight - usedH) / 2;

  const slots: SheetSlot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ x: left + c * (w + gap), y: top + r * (h + gap), w, h, rotated });
    }
  }

  const cutsX = [...new Set(slots.flatMap((s) => [s.x, s.x + s.w]))].sort((a, b) => a - b);
  const cutsY = [...new Set(slots.flatMap((s) => [s.y, s.y + s.h]))].sort((a, b) => a - b);

  return { pageWidth, pageHeight, slots, cutsX, cutsY };
}
