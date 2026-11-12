// Float RGB images for the looks engine, and the few image operations it needs
// (resize, blur). Pure TypeScript: runs in the browser, in a Web Worker and in
// tests alike.

/** An RGB image, three floats (0-1) per pixel, row by row. */
export type Rgb = { width: number; height: number; data: Float32Array };

export function blank(width: number, height: number): Rgb {
  return { width, height, data: new Float32Array(width * height * 3) };
}

/** From canvas pixels (RGBA bytes). */
export function fromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Rgb {
  const out = blank(width, height);
  for (let i = 0, j = 0; i < width * height; i++, j += 4) {
    out.data[i * 3] = rgba[j] / 255;
    out.data[i * 3 + 1] = rgba[j + 1] / 255;
    out.data[i * 3 + 2] = rgba[j + 2] / 255;
  }
  return out;
}

/** From packed RGB bytes. */
export function fromRgbBytes(bytes: Uint8Array, width: number, height: number): Rgb {
  const out = blank(width, height);
  for (let i = 0; i < bytes.length; i++) out.data[i] = bytes[i] / 255;
  return out;
}

/** To canvas pixels (RGBA bytes, opaque). */
export function toRgba(image: Rgb): Uint8ClampedArray<ArrayBuffer> {
  const n = image.width * image.height;
  const out = new Uint8ClampedArray(new ArrayBuffer(n * 4));
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[j] = image.data[i * 3] * 255 + 0.5;
    out[j + 1] = image.data[i * 3 + 1] * 255 + 0.5;
    out[j + 2] = image.data[i * 3 + 2] * 255 + 0.5;
    out[j + 3] = 255;
  }
  return out;
}

export function luminanceOf(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function luminance(image: Rgb): Float32Array {
  const n = image.width * image.height;
  const d = image.data;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = luminanceOf(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]);
  return out;
}

/** Shrinks an image so its long edge is at most `maxEdge` (area average). */
export function downscale(image: Rgb, maxEdge: number): Rgb {
  const { width: w, height: h } = image;
  const factor = Math.max(w, h) / maxEdge;
  if (factor <= 1) return image;
  return resizeArea(image, Math.max(1, Math.round(w / factor)), Math.max(1, Math.round(h / factor)));
}

/** Area-average resize to an exact size (for shrinking). */
export function resizeArea(image: Rgb, nw: number, nh: number): Rgb {
  const { width: w, height: h, data } = image;
  const out = blank(nw, nh);
  const sx = w / nw;
  const sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * sy)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(w, Math.floor((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * w + xx) * 3;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const o = (y * nw + x) * 3;
      out.data[o] = r / count;
      out.data[o + 1] = g / count;
      out.data[o + 2] = b / count;
    }
  }
  return out;
}

/** Bilinear resize (for enlarging a blurred copy back to full size). */
export function resizeBilinear(image: Rgb, nw: number, nh: number): Rgb {
  const { width: w, height: h, data } = image;
  const out = blank(nw, nh);
  const dst = out.data;
  // Column positions and weights, worked out once.
  const xa = new Int32Array(nw);
  const xb = new Int32Array(nw);
  const xt = new Float32Array(nw);
  const sx = w / nw;
  for (let x = 0; x < nw; x++) {
    const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
    xa[x] = Math.floor(fx) * 3;
    xb[x] = Math.min(w - 1, Math.floor(fx) + 1) * 3;
    xt[x] = fx - Math.floor(fx);
  }
  const sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const top = Math.floor(fy) * w * 3;
    const bottom = Math.min(h - 1, Math.floor(fy) + 1) * w * 3;
    const ty = fy - Math.floor(fy);
    let o = y * nw * 3;
    for (let x = 0; x < nw; x++) {
      const t = xt[x];
      const a = top + xa[x];
      const b = top + xb[x];
      const c = bottom + xa[x];
      const d = bottom + xb[x];
      for (let k = 0; k < 3; k++) {
        const up = data[a + k] + (data[b + k] - data[a + k]) * t;
        const down = data[c + k] + (data[d + k] - data[c + k]) * t;
        dst[o++] = up + (down - up) * ty;
      }
    }
  }
  return out;
}

/** Box sizes whose three passes approximate a Gaussian of this sigma. */
function boxSizes(sigma: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const m = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  return [0, 1, 2].map((i) => (i < m ? lower : upper));
}

/** One horizontal-then-vertical box pass over interleaved channels (edges clamped). */
function boxPass(src: Float32Array, dst: Float32Array, w: number, h: number, channels: number, radius: number) {
  if (radius < 1) {
    dst.set(src);
    return;
  }
  const tmp = new Float32Array(src.length);
  const span = radius * 2 + 1;
  const wMax = w - 1;
  const hMax = h - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * channels;
    for (let c = 0; c < channels; c++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += src[row + (x < 0 ? 0 : x > wMax ? wMax : x) * channels + c];
      for (let x = 0; x < w; x++) {
        tmp[row + x * channels + c] = sum / span;
        const add = x + radius + 1;
        const drop = x - radius;
        sum += src[row + (add > wMax ? wMax : add) * channels + c] - src[row + (drop < 0 ? 0 : drop) * channels + c];
      }
    }
  }
  const stride = w * channels;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < channels; c++) {
      const col = x * channels + c;
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += tmp[(y < 0 ? 0 : y > hMax ? hMax : y) * stride + col];
      for (let y = 0; y < h; y++) {
        dst[y * stride + col] = sum / span;
        const add = y + radius + 1;
        const drop = y - radius;
        sum += tmp[(add > hMax ? hMax : add) * stride + col] - tmp[(drop < 0 ? 0 : drop) * stride + col];
      }
    }
  }
}

/** Gaussian blur (three box passes) of interleaved channel data. */
export function gaussianBlur(data: Float32Array, w: number, h: number, channels: number, sigma: number): Float32Array {
  let a = new Float32Array(data);
  let b = new Float32Array(data.length);
  for (const size of boxSizes(sigma)) {
    boxPass(a, b, w, h, channels, (size - 1) / 2);
    [a, b] = [b, a];
  }
  return a;
}
