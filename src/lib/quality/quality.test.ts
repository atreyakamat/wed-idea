import { describe, expect, it } from "vitest";
import { flagShots, type ShotCheck } from "./flags";
import { dhash, exposure, grayFromRgba, hamming, sharpness, type Gray } from "./metrics";

/** A test scene: soft gradients plus fine detail (stripes), optionally blurred. */
function scene(width: number, height: number, { blur = 0, shift = 0, light = 1 } = {}): Uint8ClampedArray {
  const g = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const detail = ((x + shift) >> 1) % 2 === 0 && y % 7 < 5 ? 0.35 : 0;
      g[y * width + x] = Math.min(1, (0.25 + 0.4 * (x / width) + 0.2 * (y / height) + (x > width / 3 && x < width / 1.5 ? detail : 0)) * light);
    }
  }
  let img = g;
  for (let pass = 0; pass < blur; pass++) {
    const next = new Float32Array(img.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const yy = Math.min(height - 1, Math.max(0, y + dy));
            const xx = Math.min(width - 1, Math.max(0, x + dx));
            s += img[yy * width + xx];
            n++;
          }
        }
        next[y * width + x] = s / n;
      }
    }
    img = next;
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < img.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = img[i] * 255;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

const gray = (rgba: Uint8ClampedArray, w = 320, h = 240): Gray => grayFromRgba(rgba, w, h);

describe("measures", () => {
  it("score a sharp frame far above the same frame out of focus", () => {
    const sharp = sharpness(gray(scene(320, 240)));
    const soft = sharpness(gray(scene(320, 240, { blur: 3 })));
    expect(sharp).toBeGreaterThan(soft * 8);
  });

  it("give near-identical frames close fingerprints and different scenes distant ones", () => {
    const a = dhash(gray(scene(320, 240)));
    const b = dhash(gray(scene(320, 240, { shift: 1 })));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(a, b)).toBeLessThanOrEqual(6);
    const other = dhash(gray(scene(320, 240).reverse().map((v, i) => (i % 4 === 3 ? 255 : v)) as Uint8ClampedArray));
    expect(hamming(a, other)).toBeGreaterThan(16);
  });

  it("see dark and washed-out frames", () => {
    expect(exposure(gray(scene(320, 240, { light: 0.05 }))).brightness).toBeLessThan(0.06);
    expect(exposure(gray(scene(320, 240, { light: 5 }))).clipped).toBeGreaterThan(0.35);
  });

  it("shrink big photos before measuring", () => {
    const g = grayFromRgba(scene(1280, 960), 1280, 960);
    expect(Math.max(g.width, g.height)).toBe(640);
  });
});

const ok = (over: Partial<ShotCheck> = {}): ShotCheck => ({ sharpness: 60, brightness: 0.45, clipped: 0.01, dark: 0.02, dhash: "0000000000000000", faces: 2, eyesClosed: 0, ...over });
const hash = (n: number) => n.toString(16).padStart(16, "0");
/** Fingerprints far apart from each other (8 bits set in a different byte each). */
const distinct = (i: number) => "00".repeat(i % 8) + "ff" + "00".repeat(7 - (i % 8));

describe("flagging misses", () => {
  it("flags soft frames against the project's own sharpness", () => {
    const photos = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, check: ok({ dhash: distinct(i), sharpness: i === 3 ? 8 : 60 + i }) }));
    const f = flagShots(photos);
    expect(f.get("p3")!.flags).toEqual(["blurry"]);
    expect([...f.values()].filter((x) => x.flags.length).length).toBe(1);
  });

  it("doesn't flag a dim, soft-ish evening as all blurry", () => {
    const photos = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, check: ok({ dhash: distinct(i), sharpness: 9 + i }) }));
    expect([...flagShots(photos).values()].every((x) => !x.flags.includes("blurry"))).toBe(true);
  });

  it("keeps the best of a burst and flags the rest as similar", () => {
    const photos = [
      { id: "a", check: ok({ dhash: hash(0x1), sharpness: 40 }) },
      { id: "b", check: ok({ dhash: hash(0x3), sharpness: 90 }) },
      { id: "c", check: ok({ dhash: hash(0x7), sharpness: 70, eyesClosed: 1 }) },
      { id: "d", check: ok({ dhash: "ffffffffffffffff" }) },
    ];
    const f = flagShots(photos);
    expect(f.get("b")!.flags).toEqual([]);
    expect(f.get("a")).toEqual({ flags: ["similar"], similarTo: "b" });
    expect(f.get("c")!.flags).toEqual(["eyes_closed", "similar"]);
    expect(f.get("d")!.flags).toEqual([]);
  });

  it("prefers open eyes over a little extra sharpness in a burst", () => {
    const f = flagShots([
      { id: "blink", check: ok({ sharpness: 100, eyesClosed: 1 }) },
      { id: "open", check: ok({ sharpness: 80 }) },
    ]);
    expect(f.get("open")!.flags).toEqual([]);
    expect(f.get("blink")!.similarTo).toBe("open");
  });

  it("flags exposure and leaves unchecked photos alone", () => {
    const f = flagShots([
      { id: "dark", check: ok({ dhash: hash(1), brightness: 0.03, dark: 0.8 }) },
      { id: "bright", check: ok({ dhash: "ffffffff00000000", clipped: 0.5 }) },
      { id: "new", check: null },
    ]);
    expect(f.get("dark")!.flags).toContain("too_dark");
    expect(f.get("bright")!.flags).toContain("too_bright");
    expect(f.get("new")).toEqual({ flags: [], similarTo: null });
  });
});
