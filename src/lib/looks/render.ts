// Applies a look's adjustments to an image: a port of the PC app's
// worker/src/cwp_worker/looks/render.py. Exposure and white balance run in
// linear light; tone and colour in gamma space, like an editor's sliders.
import { DATA, type Look } from "./data";
import { blank, gaussianBlur, luminance, luminanceOf, resizeArea, resizeBilinear, type Rgb } from "./image";

const LUT_SIZE = 4096;
const TO_LINEAR = new Float32Array(LUT_SIZE + 1);
const TO_SRGB = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) {
  const x = i / LUT_SIZE;
  TO_LINEAR[i] = x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  TO_SRGB[i] = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
}

function lut(table: Float32Array, x: number): number {
  if (x <= 0) return table[0];
  if (x >= 1) return table[LUT_SIZE];
  const f = x * LUT_SIZE;
  const i = Math.floor(f);
  return table[i] + (table[i + 1] - table[i]) * (f - i);
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// --- Light ------------------------------------------------------------------

/** Builds a 0-1 -> value table for a per-value curve (read with `lut`). */
function table(fn: (x: number) => number): Float32Array {
  const out = new Float32Array(LUT_SIZE + 1);
  for (let i = 0; i <= LUT_SIZE; i++) out[i] = fn(i / LUT_SIZE);
  return out;
}

export function exposureAndBalance(image: Rgb, ev: number, gains: [number, number, number]): Rgb {
  if (ev === 0 && gains[0] === 1 && gains[1] === 1 && gains[2] === 1) return image;
  const mult = 2 ** ev;
  // Each channel's change depends only on its own value: one table per channel.
  const curves = gains.map((gain) =>
    table((x) => {
      let lin = lut(TO_LINEAR, x) * mult * gain;
      if (lin > 0.8) lin = 0.8 + (1 - Math.exp(-(lin - 0.8) / 0.2)) * 0.2;
      return lut(TO_SRGB, lin);
    }),
  );
  const out = blank(image.width, image.height);
  const src = image.data;
  const [cr, cg, cb] = curves;
  for (let i = 0; i < src.length; i += 3) {
    out.data[i] = lut(cr, src[i]);
    out.data[i + 1] = lut(cg, src[i + 1]);
    out.data[i + 2] = lut(cb, src[i + 2]);
  }
  return out;
}

export function temperatureGains(temperature: number, tint: number): [number, number, number] {
  return [1 + 0.18 * temperature + 0.04 * tint, 1 - 0.08 * tint, 1 - 0.22 * temperature + 0.04 * tint];
}

// --- Tone -------------------------------------------------------------------

/** Writes pixel i with a new brightness, keeping its colour (as render._with_luminance). */
function setLuminance(src: Float32Array, dst: Float32Array, i: number, old: number, next: number) {
  const ratio = old > 1e-4 ? next / old : 1;
  const r = src[i] * ratio;
  const g = src[i + 1] * ratio;
  const b = src[i + 2] * ratio;
  const over = Math.max(r, g, b);
  if (over > 1) {
    const k = (1 - next) / Math.max(over, 1e-4);
    dst[i] = next + (r - next) * k;
    dst[i + 1] = next + (g - next) * k;
    dst[i + 2] = next + (b - next) * k;
  } else {
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
  }
}

/** The brightness curve of tone(): old luminance -> new. */
function toneCurve(contrast: number, highlights: number, shadows: number): (lum: number) => number {
  return (lum) => {
    let y = lum;
    if (shadows) y = y + shadows * 0.45 * (1 - y) ** 3 * Math.sqrt(Math.max(y, 0)) * 2;
    if (highlights) {
      const hi = clamp01((y - 0.45) / 0.55) ** 1.5;
      y = highlights > 0 ? y + highlights * 0.35 * hi * (1 - y + 0.15) : y + highlights * 0.4 * hi * (y - 0.35);
    }
    if (contrast) {
      const s = clamp01(y);
      y = s + contrast * 0.6 * s * (1 - s) * (2 * s - 1) * 2;
    }
    return clamp01(y);
  };
}

export function tone(image: Rgb, contrast: number, highlights: number, shadows: number, fade: number): Rgb {
  const curve = table(toneCurve(contrast, highlights, shadows));
  const out = blank(image.width, image.height);
  const src = image.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 3) {
    const lum = luminanceOf(src[i], src[i + 1], src[i + 2]);
    setLuminance(src, dst, i, lum, lut(curve, lum));
    for (let k = 0; k < 3; k++) {
      let v = dst[i + k];
      if (fade) v = fade + v * (1 - fade * 1.1);
      dst[i + k] = clamp01(v);
    }
  }
  return out;
}

export function clarity(image: Rgb, amount: number): Rgb {
  if (!amount) return image;
  const { width: w, height: h } = image;
  const lum = luminance(image);
  // PIL blurs an 8-bit copy of the luminance.
  for (let i = 0; i < lum.length; i++) lum[i] = Math.floor(lum[i] * 255) / 255;
  const radius = Math.max(2, Math.max(w, h) * 0.012);
  const blurred = blurLuminance(lum, w, h, radius);
  const out = blank(w, h);
  const src = image.data;
  for (let p = 0; p < lum.length; p++) {
    const i = p * 3;
    const l = luminanceOf(src[i], src[i + 1], src[i + 2]);
    const b = Math.floor(blurred[p] * 255 + 1e-6) / 255;
    const mid = 1 - Math.abs(l - 0.5) * 2;
    const next = clamp01(l + amount * 0.8 * (l - b) * mid);
    setLuminance(src, out.data, i, l, next);
    for (let k = 0; k < 3; k++) out.data[i + k] = clamp01(out.data[i + k]);
  }
  return out;
}

/** Large blurs run on a half-size copy: the result is the same to the eye, four times quicker. */
function blurLuminance(lum: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 8) return gaussianBlur(lum, w, h, 1, sigma);
  const grey: Rgb = { width: w, height: h, data: new Float32Array(lum.length * 3) };
  for (let i = 0; i < lum.length; i++) grey.data[i * 3] = grey.data[i * 3 + 1] = grey.data[i * 3 + 2] = lum[i];
  const small = resizeArea(grey, Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
  const one = new Float32Array(small.width * small.height);
  for (let i = 0; i < one.length; i++) one[i] = small.data[i * 3];
  const blurred = gaussianBlur(one, small.width, small.height, 1, sigma / 2);
  const back: Rgb = { width: small.width, height: small.height, data: new Float32Array(one.length * 3) };
  for (let i = 0; i < one.length; i++) back.data[i * 3] = back.data[i * 3 + 1] = back.data[i * 3 + 2] = blurred[i];
  const big = resizeBilinear(back, w, h);
  const out = new Float32Array(lum.length);
  for (let i = 0; i < out.length; i++) out[i] = big.data[i * 3];
  return out;
}

// --- Colour -----------------------------------------------------------------

/** Hue (degrees) and saturation of the last pixel given to hueSatInto. */
export const HS = { h: 0, s: 0 };

/** Hue and saturation of one pixel, as features.hsv (into HS: no allocation per pixel). */
export function hueSatInto(r: number, g: number, b: number): void {
  const v = Math.max(r, g, b);
  const c = v - Math.min(r, g, b);
  HS.s = v > 0 ? c / Math.max(v, 1e-6) : 0;
  if (c === 0) {
    HS.h = 0;
    return;
  }
  const safe = Math.max(c, 1e-6);
  let h: number;
  if (v === r) h = ((((g - b) / safe) % 6) + 6) % 6;
  else if (v === g) h = (b - r) / safe + 2;
  else h = (r - g) / safe + 4;
  HS.h = h * 60;
}

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

const HUE_STEPS = 720; // half-degree tables

/** A table over hue (0-360) of a sum of bell curves. */
function hueTable(bells: { centre: number; width: number; amount: number }[]): Float32Array {
  const out = new Float32Array(HUE_STEPS + 1);
  for (let i = 0; i <= HUE_STEPS; i++) {
    const h = (i / HUE_STEPS) * 360;
    for (const b of bells) out[i] += b.amount * Math.exp(-((wrap(h - b.centre) / b.width) ** 2));
  }
  return out;
}

function hueAt(t: Float32Array, h: number): number {
  const f = (h / 360) * HUE_STEPS;
  const i = Math.min(HUE_STEPS - 1, Math.max(0, Math.floor(f)));
  return t[i] + (t[i + 1] - t[i]) * (f - i);
}

export function colour(image: Rgb, saturation: number, vibrance: number, hsl: Record<string, [number, number]>): Rgb {
  const bands = Object.entries(hsl).map(([band, [sat, light]]) => ({ centre: DATA.hueBands[band], sat, light }));
  if (!saturation && !vibrance && !bands.length) return image;
  const skinT = hueTable([{ centre: 25, width: 18, amount: 1 }]);
  const satT = hueTable(bands.map((b) => ({ centre: b.centre, width: 28, amount: b.sat })));
  const liftT = hueTable(bands.map((b) => ({ centre: b.centre, width: 28, amount: b.light * 0.25 })));
  const out = blank(image.width, image.height);
  const src = image.data;
  for (let i = 0; i < src.length; i += 3) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const lum = luminanceOf(r, g, b);
    hueSatInto(r, g, b);
    const h = HS.h;
    const s = HS.s;
    let scale = 1 + saturation;
    if (vibrance) scale += vibrance * (1 - s) * (1 - 0.6 * (s < 0.6 ? hueAt(skinT, h) : 0));
    let lift = 0;
    if (bands.length) {
      const weight = clamp01(s * 2.5);
      scale += hueAt(satT, h) * weight;
      lift = hueAt(liftT, h) * weight;
    }
    if (scale < 0) scale = 0;
    for (let k = 0; k < 3; k++) {
      let v = lum + (src[i + k] - lum) * scale;
      if (lift > 0) v += lift * (1 - v);
      else if (lift < 0) v += lift * v;
      out.data[i + k] = clamp01(v);
    }
  }
  return out;
}

export function splitTone(image: Rgb, shadows: [number, number, number], highlights: [number, number, number]): Rgb {
  if (!shadows.some(Boolean) && !highlights.some(Boolean)) return image;
  const out = blank(image.width, image.height);
  const src = image.data;
  for (let i = 0; i < src.length; i += 3) {
    const lum = luminanceOf(src[i], src[i + 1], src[i + 2]);
    const lo = (1 - lum) ** 2 * 2;
    const hi = lum * lum * 2;
    for (let k = 0; k < 3; k++) out.data[i + k] = clamp01(src[i + k] + shadows[k] * lo + highlights[k] * hi);
  }
  return out;
}

export function mono(image: Rgb, mix: [number, number, number]): Rgb {
  const total = mix[0] + mix[1] + mix[2];
  const [wr, wg, wb] = mix.map((m) => m / total);
  const out = blank(image.width, image.height);
  const src = image.data;
  for (let i = 0; i < src.length; i += 3) {
    const grey = src[i] * wr + src[i + 1] * wg + src[i + 2] * wb;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = grey;
  }
  return out;
}

// --- Glow, haze, grain, vignette -------------------------------------------

/** Gaussian blur on a smaller copy, for speed (large radii only), as render._blur. */
function softBlur(image: Rgb, radius: number, scale = 4): Rgb {
  const { width: w, height: h } = image;
  const small = resizeArea(image, Math.max(1, Math.floor(w / scale)), Math.max(1, Math.floor(h / scale)));
  const blurred = { ...small, data: gaussianBlur(small.data, small.width, small.height, 3, Math.max(0.5, radius / scale)) };
  return resizeBilinear(quantise(blurred), w, h);
}

/** Rounds to 8 bits, as the PC app's engine does between PIL steps. */
function quantise(image: Rgb): Rgb {
  const out = blank(image.width, image.height);
  for (let i = 0; i < image.data.length; i++) out.data[i] = Math.round(clamp01(image.data[i]) * 255) / 255;
  return out;
}

export function glow(image: Rgb, amount: number, radius: number): Rgb {
  if (!amount) return image;
  const bright = blank(image.width, image.height);
  const src = image.data;
  for (let i = 0; i < src.length; i += 3) {
    const lum = luminanceOf(src[i], src[i + 1], src[i + 2]);
    const w = clamp01((lum - 0.55) / 0.45) ** 1.5;
    for (let k = 0; k < 3; k++) bright.data[i + k] = src[i + k] * w;
  }
  const bloom = softBlur(bright, Math.max(image.width, image.height) * radius);
  const out = blank(image.width, image.height);
  for (let i = 0; i < src.length; i++) out.data[i] = clamp01(1 - (1 - src[i]) * (1 - bloom.data[i] * amount * 1.4));
  return out;
}

export function soften(image: Rgb, amount: number): Rgb {
  if (!amount) return image;
  const hazy = softBlur(image, Math.max(image.width, image.height) * 0.008, 2);
  const out = blank(image.width, image.height);
  const src = image.data;
  for (let i = 0; i < src.length; i++) {
    const lighter = Math.max(src[i], hazy.data[i]);
    out.data[i] = clamp01(src[i] * (1 - amount * 0.5) + lighter * amount * 0.5);
  }
  return out;
}

export function vignette(image: Rgb, amount: number): Rgb {
  if (!amount) return image;
  const { width: w, height: h } = image;
  const out = blank(w, h);
  const src = image.data;
  for (let y = 0; y < h; y++) {
    const dy = (y - h / 2) / (h / 2);
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2);
      const d = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      const mask = clamp01((d - 0.45) / 0.55) ** 2;
      const i = (y * w + x) * 3;
      for (let k = 0; k < 3; k++) {
        out.data[i + k] = amount > 0 ? src[i + k] * (1 - amount * 0.55 * mask) : 1 - (1 - src[i + k]) * (1 + amount * 0.55 * mask);
      }
    }
  }
  return out;
}

/** A small seeded random generator (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Standard normal samples, picked at random for grain (much quicker than Box-Muller per pixel). */
const NORMALS = (() => {
  const next = random(12345);
  const out = new Float32Array(65536);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(-2 * Math.log(Math.max(next(), 1e-12))) * Math.cos(2 * Math.PI * next());
  return out;
})();

/** Film grain, strongest in the midtones. Same photo and seed, same grain. */
export function grain(image: Rgb, amount: number, seed: number): Rgb {
  if (!amount) return image;
  let state = seed >>> 0 || 1;
  const out = blank(image.width, image.height);
  const src = image.data;
  for (let i = 0; i < src.length; i += 3) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const noise = NORMALS[(state >>> 0) & 0xffff];
    const lum = luminanceOf(src[i], src[i + 1], src[i + 2]);
    const strength = amount * 0.06 * (1 - Math.abs(lum - 0.5) * 1.4);
    for (let k = 0; k < 3; k++) out.data[i + k] = clamp01(src[i + k] + noise * strength);
  }
  return out;
}

/** Applies a look (after the automatic fix). strength 0-1 blends it in. */
export function applyLook(image: Rgb, look: Look, strength = 1, seed = 0): Rgb {
  let out = exposureAndBalance(image, look.exposure, temperatureGains(look.temperature, look.tint));
  out = tone(out, look.contrast, look.highlights, look.shadows, 0);
  out = clarity(out, look.clarity);
  if (look.mono) out = mono(out, look.mono);
  else {
    out = colour(out, look.saturation, look.vibrance, look.hsl);
    out = splitTone(out, look.split_shadows, look.split_highlights);
  }
  out = glow(out, look.glow, look.glow_radius);
  out = soften(out, look.soften);
  if (look.fade) {
    const faded = blank(out.width, out.height);
    for (let i = 0; i < out.data.length; i++) faded.data[i] = clamp01(look.fade + out.data[i] * (1 - look.fade * 1.1));
    out = faded;
  }
  out = vignette(out, look.vignette);
  out = grain(out, look.grain, seed);
  if (strength < 1) {
    const mixed = blank(out.width, out.height);
    for (let i = 0; i < out.data.length; i++) mixed.data[i] = image.data[i] * (1 - strength) + out.data[i] * strength;
    out = mixed;
  }
  return out;
}

