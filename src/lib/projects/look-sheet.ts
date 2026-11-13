// Look sheets: the designs a studio offers, and the layout math. Kept free of
// browser APIs so the server and the tests can use it.

export const SHEET_DESIGNS = ["grid", "before-after"] as const;
export type SheetDesign = (typeof SHEET_DESIGNS)[number];

export const SHEET_DESIGN_LABELS: Record<SheetDesign, string> = {
  grid: "Grid of looks",
  "before-after": "Before and after",
};

/** The designs a studio has chosen: unknown values and repeats dropped, in a fixed order. */
export function validDesigns(value: unknown): SheetDesign[] {
  if (!Array.isArray(value)) return [];
  const chosen = new Set<SheetDesign>();
  for (const v of value) if ((SHEET_DESIGNS as readonly unknown[]).includes(v)) chosen.add(v as SheetDesign);
  return SHEET_DESIGNS.filter((d) => chosen.has(d));
}

/** Top-left corner of each of `count` tiles, `cols` to a row, with `gap` around every tile. */
export function gridPositions(count: number, cols: number, tileW: number, tileH: number, gap: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    x: gap + (i % cols) * (tileW + gap),
    y: gap + Math.floor(i / cols) * (tileH + gap),
  }));
}
