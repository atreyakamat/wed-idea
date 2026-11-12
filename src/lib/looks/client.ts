// Browser side of the looks engine: decodes photos, sends the pixel work to a
// small pool of Web Workers and encodes the results as JPEGs.
import type { Group } from "./data";
import type { StylePrefs } from "./engine";
import type { Features } from "./features";
import type { PlanReply, WorkerReply, WorkerRequest } from "./looks.worker";

type Pending = { resolve: (reply: WorkerReply) => void };

type Slot = { worker: Worker; busy: number };

let slots: Slot[] | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function pool(): Slot[] {
  if (slots) return slots;
  const size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  slots = Array.from({ length: size }, () => {
    const worker = new Worker(new URL("./looks.worker.ts", import.meta.url), { type: "module" });
    const slot: Slot = { worker, busy: 0 };
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      slot.busy--;
      const p = pending.get(event.data.id);
      pending.delete(event.data.id);
      p?.resolve(event.data);
    };
    return slot;
  });
  return slots;
}

type Request = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

function send(request: Request): Promise<WorkerReply> {
  const slot = pool().reduce((a, b) => (b.busy < a.busy ? b : a));
  const id = nextId++;
  slot.busy++;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    // The pixels are copied, not transferred: callers often reuse them.
    slot.worker.postMessage({ ...request, id });
  });
}

/** Pixels of a photo at most `maxEdge` px on its long edge. */
export type Pixels = { rgba: Uint8ClampedArray; width: number; height: number };

export async function decode(source: Blob | ImageBitmap, maxEdge: number): Promise<Pixels> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : source;
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Your browser can't edit photos.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { rgba: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    if (source instanceof Blob) bitmap.close();
  }
}

/** Downloads a photo and decodes it. */
export async function decodeUrl(url: string, maxEdge: number, signal?: AbortSignal): Promise<Pixels> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Couldn't load the photo.");
  return decode(await res.blob(), maxEdge);
}

export function toCanvas(pixels: Pixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(pixels.rgba), pixels.width, pixels.height), 0, 0);
  return canvas;
}

/** JPEG of the pixels, shrunk to `maxEdge` if larger. */
export async function encodeJpeg(pixels: Pixels, maxEdge: number, quality: number): Promise<Blob> {
  const source = toCanvas(pixels);
  const scale = Math.min(1, maxEdge / Math.max(pixels.width, pixels.height));
  let canvas = source;
  if (scale < 1) {
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(pixels.width * scale));
    canvas.height = Math.max(1, Math.round(pixels.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser can't edit photos.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't save the edited photo.");
  return blob;
}

/** Measures a photo, sorts its light and picks a look (or uses the given ones). */
export async function planPhoto(pixels: Pixels, options: { group?: Group; style?: StylePrefs; lookId?: string } = {}): Promise<PlanReply> {
  const reply = await send({ kind: "plan", ...pixels, ...options });
  if (!reply.ok || !reply.plan) throw new Error(reply.ok ? "No plan" : reply.error);
  return reply.plan;
}

/** Renders a photo with a look. `seed` keeps film grain the same between renders. */
export async function renderLook(pixels: Pixels, features: Features, group: Group, lookId: string, strength: number, seed: string): Promise<Pixels> {
  const reply = await send({ kind: "render", ...pixels, features, group, lookId, strength, seed });
  if (!reply.ok || !reply.rgba) throw new Error(reply.ok ? "No image" : reply.error);
  return { rgba: reply.rgba, width: pixels.width, height: pixels.height };
}
