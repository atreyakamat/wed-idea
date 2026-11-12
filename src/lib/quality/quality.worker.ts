/// <reference lib="webworker" />
// Checks one photo at a time off the main thread: sharpness, exposure, a
// fingerprint, and (with MediaPipe's face model) whether anyone's eyes are
// closed. The photo never leaves the computer.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { dhash, exposure, grayFromRgba, sharpness } from "./metrics";

/** Google's published face model (data, not code). Cached by the browser after the first load. */
export const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
/** MediaPipe's WebAssembly, copied into public/ at build time (scripts/copy-mediapipe.mjs). */
const WASM_BASE = "/vendor/mediapipe";
/** Faces smaller than this share of the photo's width are background people: not judged. */
const MIN_FACE_WIDTH = 0.05;
/** Both eyes' blink scores above this means closed. */
const BLINK = 0.45;

export type QualityRequest = { id: number; rgba: Uint8ClampedArray; width: number; height: number };
export type QualityResult = {
  sharpness: number;
  brightness: number;
  clipped: number;
  dark: number;
  dhash: string;
  /** null when the face model couldn't load (offline): eyes aren't judged then. */
  faces: number | null;
  eyesClosed: number | null;
};
export type QualityReply = { id: number; ok: true; result: QualityResult } | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope & { import?: (url: string) => Promise<unknown> };

// This is a module worker, where importScripts() can't load MediaPipe's ES
// module loader. MediaPipe falls back to self.import() when importScripts
// throws a TypeError, so give it both.
scope.importScripts = () => {
  throw new TypeError("importScripts isn't available in module workers");
};
scope.import = (url: string) => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);

// MediaPipe prints routine start-up notes ("INFO: …", "W1112 …") as
// errors; keep them out of the photographer's console as errors.
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && /^(INFO:|[IW]\d{4} )/.test(args[0])) console.debug(...args);
  else consoleError(...args);
};

let landmarker: Promise<FaceLandmarker | null> | null = null;

function faceModel(): Promise<FaceLandmarker | null> {
  landmarker ??= (async () => {
    try {
      const fileset = await FilesetResolver.forVisionTasks(new URL(WASM_BASE, scope.location.origin).toString(), true);
      return await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 12,
        outputFaceBlendshapes: true,
      });
    } catch (e) {
      // Without the model, eyes just aren't checked; say why in the console for support.
      console.warn("Face model unavailable:", e);
      return null;
    }
  })();
  return landmarker;
}

function score(categories: { categoryName: string; score: number }[], name: string): number {
  return categories.find((c) => c.categoryName === name)?.score ?? 0;
}

type Face = { x0: number; x1: number; y0: number; y1: number; pixels: number; closed: boolean };

/** Copies part of a picture (a tile) into its own ImageData. */
function crop(rgba: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number): ImageData {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) out.set(rgba.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4), row * w * 4);
  return new ImageData(out, w, h);
}

/**
 * The face model is made for faces that fill a good part of the frame, so
 * the photo is also searched in overlapping tiles (2×2 and 3×3) to find the
 * smaller faces of a group or a wide shot. A face found more than once is
 * judged from the view that shows it largest.
 */
async function eyes(rgba: Uint8ClampedArray, width: number, height: number): Promise<{ faces: number | null; eyesClosed: number | null }> {
  const model = await faceModel();
  if (!model) return { faces: null, eyesClosed: null };
  const found: Face[] = [];
  for (const grid of [1, 2, 3]) {
    const tw = grid === 1 ? width : Math.round((width / grid) * 1.4);
    const th = grid === 1 ? height : Math.round((height / grid) * 1.4);
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const x = grid === 1 ? 0 : Math.min(width - tw, Math.round((gx * (width - tw)) / (grid - 1)));
        const y = grid === 1 ? 0 : Math.min(height - th, Math.round((gy * (height - th)) / (grid - 1)));
        const result = model.detect(grid === 1 ? new ImageData(new Uint8ClampedArray(rgba), width, height) : crop(rgba, width, x, y, tw, th));
        result.faceLandmarks.forEach((points, i) => {
          const xs = points.map((p) => (x + p.x * tw) / width);
          const ys = points.map((p) => (y + p.y * th) / height);
          const cats = result.faceBlendshapes[i]?.categories ?? [];
          found.push({
            x0: Math.min(...xs),
            x1: Math.max(...xs),
            y0: Math.min(...ys),
            y1: Math.max(...ys),
            pixels: (Math.max(...xs) - Math.min(...xs)) * width * (width / tw),
            closed: score(cats, "eyeBlinkLeft") > BLINK && score(cats, "eyeBlinkRight") > BLINK,
          });
        });
      }
    }
  }
  // Merge sightings of the same face (centres close together).
  const faces: Face[] = [];
  for (const f of found.sort((a, b) => b.pixels - a.pixels)) {
    const cx = (f.x0 + f.x1) / 2;
    const cy = (f.y0 + f.y1) / 2;
    const same = faces.find((g) => Math.abs((g.x0 + g.x1) / 2 - cx) < (g.x1 - g.x0) / 2 && Math.abs((g.y0 + g.y1) / 2 - cy) < (g.y1 - g.y0) / 2);
    if (!same) faces.push(f);
  }
  const judged = faces.filter((f) => f.x1 - f.x0 >= MIN_FACE_WIDTH);
  return { faces: judged.length, eyesClosed: judged.filter((f) => f.closed).length };
}

scope.onmessage = async (event: MessageEvent<QualityRequest>) => {
  const { id, rgba, width, height } = event.data;
  try {
    const gray = grayFromRgba(rgba, width, height);
    const e = exposure(gray);
    const face = await eyes(rgba, width, height);
    const result: QualityResult = { sharpness: sharpness(gray), brightness: e.brightness, clipped: e.clipped, dark: e.dark, dhash: dhash(gray), ...face };
    scope.postMessage({ id, ok: true, result } satisfies QualityReply);
  } catch (e) {
    scope.postMessage({ id, ok: false, error: (e as Error).message } satisfies QualityReply);
  }
};
