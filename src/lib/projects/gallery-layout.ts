// Pure helpers for the public gallery: layout, download parts, file names.

/** Columns for a gallery of this width (px). */
export function columnsFor(width: number): number {
  if (width < 560) return 2;
  if (width < 960) return 3;
  return 4;
}

/**
 * Masonry: places each photo, in order, at the bottom of the shortest column.
 * Uses the photos' known sizes, so nothing shifts while they load. Returns the
 * photo indexes in each column.
 */
export function masonry(items: readonly { width: number; height: number }[], columns: number): number[][] {
  const cols = Math.max(1, Math.floor(columns));
  const heights = new Array<number>(cols).fill(0);
  const out: number[][] = Array.from({ length: cols }, () => []);
  items.forEach((item, i) => {
    let shortest = 0;
    for (let c = 1; c < cols; c++) if (heights[c] < heights[shortest] - 1e-9) shortest = c;
    out[shortest].push(i);
    heights[shortest] += item.width > 0 ? item.height / item.width : 1;
  });
  return out;
}

/** Splits a download into parts of at most `perPart` photos. */
export function downloadParts<T>(items: readonly T[], perPart: number): T[][] {
  const size = Math.max(1, Math.floor(perPart));
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

/** Makes file names unique inside one zip: "IMG_1.jpg", "IMG_1 (2).jpg"… */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
  });
}

/** "Meera's 30th" -> "Meeras-30th-photos": a safe zip file name. */
export function zipName(projectName: string, part?: { index: number; total: number }): string {
  const base = projectName.replace(/['’]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "photos";
  return part && part.total > 1 ? `${base}-photos-part-${part.index + 1}-of-${part.total}.zip` : `${base}-photos.zip`;
}

/** Rough size label for a number of web-size photos (~0.6 MB each). */
export function approxSize(count: number): string {
  const mb = count * 0.6;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}
