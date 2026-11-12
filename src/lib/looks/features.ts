// Measures what the light in a photo is like: a port of the PC app's
// worker/src/cwp_worker/looks/features.py. Measured on a small copy (long
// edge 384 px) so it's quick and doesn't depend on the photo's size.
import { downscale, luminance, type Rgb } from "./image";
import { HS, hueSatInto } from "./render";

export const SAMPLE_EDGE = 384;

export type Features = {
  brightness: number;
  median: number;
  p05: number;
  p95: number;
  contrast: number;
  clipped_highlights: number;
  dark_share: number;
  warmth: number;
  tint: number;
  saturation: number;
  neon_share: number;
  highlight_warmth: number;
  sky_share: number;
  green_share: number;
  skin_share: number;
  centre_ratio: number;
  top_ratio: number;
  blue_top: number;
  warm_highlights: number;
  spot_share: number;
  flash_fired: boolean;
};

/** numpy.percentile (linear) of a sorted array. */
function percentile(sorted: Float32Array, q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function mean(values: ArrayLike<number>, from = 0, to = values.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i];
  return to > from ? sum / (to - from) : 0;
}

/** Measures a photo. `flashFired` comes from the original's EXIF when known. */
export function measure(image: Rgb, flashFired = false): Features {
  const rgb = downscale(image, SAMPLE_EDGE);
  const { width: ww, height: hh, data } = rgb;
  const n = ww * hh;
  const lum = luminance(rgb);
  const sorted = Float32Array.from(lum).sort();
  const p05 = percentile(sorted, 0.05);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);

  const hue = new Float32Array(n);
  const sat = new Float32Array(n);
  const val = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 3;
    hueSatInto(data[i], data[i + 1], data[i + 2]);
    hue[p] = HS.h;
    sat[p] = HS.s;
    val[p] = Math.max(data[i], data[i + 1], data[i + 2]);
  }

  // Mid-tone colour balance (all pixels if none are mid-tone).
  const sums = [0, 0, 0];
  let count = 0;
  for (let p = 0; p < n; p++) {
    if (lum[p] > 0.12 && lum[p] < 0.92) {
      for (let k = 0; k < 3; k++) sums[k] += data[p * 3 + k];
      count++;
    }
  }
  if (!count) {
    for (let p = 0; p < n; p++) for (let k = 0; k < 3; k++) sums[k] += data[p * 3 + k];
    count = n;
  }
  const means = sums.map((s) => s / count);
  const warmth = means[0] / Math.max(means[2], 1e-3);
  const tint = means[1] - (means[0] + means[2]) / 2;

  const topCut = p95;
  const hiSums = [0, 0, 0];
  let hiCount = 0;
  for (let p = 0; p < n; p++) {
    if (lum[p] >= topCut) {
      for (let k = 0; k < 3; k++) hiSums[k] += data[p * 3 + k];
      hiCount++;
    }
  }
  const hi = hiCount ? hiSums.map((s) => s / hiCount) : means;
  const highlightWarmth = hi[0] / Math.max(hi[2], 1e-3);

  const third = Math.floor(hh / 3);
  let neon = 0;
  let sky = 0;
  let green = 0;
  let skin = 0;
  let blueTop = 0;
  let warmHi = 0;
  let clipped = 0;
  let dark = 0;
  let spots = 0;
  for (let p = 0; p < n; p++) {
    const h = hue[p];
    const s = sat[p];
    const v = val[p];
    const top = Math.floor(p / ww) < third;
    if (s > 0.6 && v > 0.35 && (h >= 255 || h <= 10 || (h >= 100 && h <= 185))) neon++;
    if (top && h >= 190 && h <= 240 && s > 0.18 && v > 0.55) sky++;
    if (h >= 70 && h <= 160 && s > 0.25 && v > 0.15) green++;
    if (h >= 5 && h <= 40 && s > 0.18 && s < 0.65 && v > 0.3) skin++;
    if (top && h >= 185 && h <= 250 && s > 0.15 && v > 0.25) blueTop++;
    if (lum[p] > 0.7 && h >= 15 && h <= 60 && s > 0.25) warmHi++;
    if (lum[p] > 0.97) clipped++;
    if (lum[p] < 0.15) dark++;
    if (lum[p] > 0.85) spots++;
  }
  const topPixels = third * ww;

  // Centre vs edge brightness (flash fall-off).
  let centreSum = 0;
  let centreCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < ww; x++) {
      const l = lum[y * ww + x];
      if (y >= Math.floor(hh / 4) && y < Math.floor((3 * hh) / 4) && x >= Math.floor(ww / 4) && x < Math.floor((3 * ww) / 4)) {
        centreSum += l;
        centreCount++;
      }
      const inner = y >= Math.floor(hh / 6) && y < Math.floor((5 * hh) / 6) && x >= Math.floor(ww / 6) && x < Math.floor((5 * ww) / 6);
      if (!inner) {
        edgeSum += l;
        edgeCount++;
      }
    }
  }
  const centreMean = centreCount ? centreSum / centreCount : 0;
  const edgeMean = edgeCount ? edgeSum / edgeCount : 0;
  const topL = mean(lum, 0, third * ww);
  const bottomL = mean(lum, Math.floor((2 * hh) / 3) * ww, n);

  return {
    brightness: mean(lum),
    median,
    p05,
    p95,
    contrast: p95 - p05,
    clipped_highlights: clipped / n,
    dark_share: dark / n,
    warmth,
    tint,
    saturation: mean(sat),
    neon_share: neon / n,
    highlight_warmth: highlightWarmth,
    sky_share: (topPixels ? sky / topPixels : 0) / 3,
    green_share: green / n,
    skin_share: skin / n,
    centre_ratio: centreMean / Math.max(edgeMean, 1e-3),
    top_ratio: topL / Math.max(bottomL, 1e-3),
    blue_top: topPixels ? blueTop / topPixels : 0,
    warm_highlights: warmHi / n,
    spot_share: dark / n > 0.4 ? spots / n : 0,
    flash_fired: flashFired,
  };
}
