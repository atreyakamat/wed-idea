// A photo's average colour, shown as a placeholder while it loads.

/** "#rrggbb" from RGBA pixel data (alpha ignored). */
export function toneFromPixels(data: Uint8ClampedArray | number[]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = Math.floor(data.length / 4);
  if (!n) return "#808080";
  for (let i = 0; i < n * 4; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** The average colour of an image file, in the browser. Null if it can't be read. */
export async function averageTone(image: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(image, { resizeWidth: 16, resizeHeight: 16, resizeQuality: "medium" });
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return toneFromPixels(ctx.getImageData(0, 0, 16, 16).data);
  } catch {
    return null;
  }
}
