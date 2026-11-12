// Measures that help spot missed shots: sharpness, exposure and a small
// fingerprint for finding near-identical frames. Pure functions over pixels.

/** Long edge the measures are taken at, so they compare across photos. */
export const MEASURE_EDGE = 640;

export type Gray = { width: number; height: number; data: Float32Array };

/** Luminance (0-1) of RGBA pixels, shrunk (area average) to at most `maxEdge`. */
export function grayFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, maxEdge = MEASURE_EDGE): Gray {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const sum = new Float32Array(w * h);
  const count = new Float32Array(w * h);
  for (let y = 0; y < height; y++) {
    const ty = Math.min(h - 1, Math.floor(y * scale));
    for (let x = 0; x < width; x++) {
      const tx = Math.min(w - 1, Math.floor(x * scale));
      const i = (y * width + x) * 4;
      const t = ty * w + tx;
      sum[t] += (rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722) / 255;
      count[t]++;
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] /= count[i] || 1;
  return { width: w, height: h, data: sum };
}

/**
 * Sharpness: variance of the Laplacian over the busiest part of the frame.
 * A sharp subject on a soft background still scores well, because only the
 * top 30% of 32×32 tiles (by detail) count.
 */
export function sharpness(g: Gray): number {
  const { width: w, height: h, data } = g;
  if (w < 3 || h < 3) return 0;
  const TILE = 32;
  const tiles: number[] = [];
  for (let ty = 1; ty < h - 1; ty += TILE) {
    for (let tx = 1; tx < w - 1; tx += TILE) {
      let s = 0;
      let s2 = 0;
      let n = 0;
      for (let y = ty; y < Math.min(h - 1, ty + TILE); y++) {
        for (let x = tx; x < Math.min(w - 1, tx + TILE); x++) {
          const i = y * w + x;
          const lap = data[i - 1] + data[i + 1] + data[i - w] + data[i + w] - 4 * data[i];
          s += lap;
          s2 += lap * lap;
          n++;
        }
      }
      if (n >= 64) tiles.push(s2 / n - (s / n) ** 2);
    }
  }
  if (!tiles.length) return 0;
  tiles.sort((a, b) => b - a);
  const top = tiles.slice(0, Math.max(1, Math.ceil(tiles.length * 0.3)));
  // ×1e4 keeps the numbers readable (a sharp photo scores roughly 20-200).
  return (top.reduce((a, b) => a + b, 0) / top.length) * 1e4;
}

export type Exposure = { brightness: number; clipped: number; dark: number };

export function exposure(g: Gray): Exposure {
  let sum = 0;
  let clipped = 0;
  let dark = 0;
  for (const v of g.data) {
    sum += v;
    if (v > 0.98) clipped++;
    if (v < 0.04) dark++;
  }
  const n = g.data.length || 1;
  return { brightness: sum / n, clipped: clipped / n, dark: dark / n };
}

/** 64-bit difference hash ("dHash") as 16 hex characters. Similar frames differ in few bits. */
export function dhash(g: Gray): string {
  const W = 9;
  const H = 8;
  const cells = new Float32Array(W * H);
  const counts = new Float32Array(W * H);
  for (let y = 0; y < g.height; y++) {
    const cy = Math.min(H - 1, Math.floor((y / g.height) * H));
    for (let x = 0; x < g.width; x++) {
      const cx = Math.min(W - 1, Math.floor((x / g.width) * W));
      cells[cy * W + cx] += g.data[y * g.width + x];
      counts[cy * W + cx]++;
    }
  }
  for (let i = 0; i < cells.length; i++) cells[i] /= counts[i] || 1;
  let hex = "";
  for (let y = 0; y < H; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (cells[y * W + x] > cells[y * W + x + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** How many bits two hashes differ in (0 = same picture, 64 = opposite). */
export function hamming(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64;
  let bits = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = (Number.parseInt(a.slice(i, i + 2), 16) ^ Number.parseInt(b.slice(i, i + 2), 16)) & 0xff;
    while (x) {
      bits += x & 1;
      x >>>= 1;
    }
  }
  return bits;
}
