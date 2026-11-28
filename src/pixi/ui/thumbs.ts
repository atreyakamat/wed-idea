import { RetroRenderer } from "@/pixi/engine/renderer";
import type { Preset } from "@/pixi/engine/types";
import { sampleScene } from "./sampleScene";

let r: RetroRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let chain: Promise<unknown> = Promise.resolve();
const cache = new Map<string, string>();

const keyOf = (p: Preset) => p.id + ":" + (p.id.startsWith("my-") ? JSON.stringify([p.layers, p.overlays]).length + ":" + JSON.stringify(p.layers).slice(0, 400) : "");

/** Renders a small preview of a look on the shared sample scene. Queued so the UI stays responsive. */
export function thumbFor(p: Preset): Promise<string> {
  const k = keyOf(p);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  const job = chain.then(async () => {
    await new Promise((res) => requestAnimationFrame(() => res(null)));
    if (!r) {
      canvas = document.createElement("canvas");
      r = new RetroRenderer(canvas);
      const s = sampleScene(600, 800);
      r.setSource(s, s.width, s.height);
      r.warmUp();
    }
    r.render({ preset: { ...p, overlays: p.overlays ?? [] }, intensity: 1, mirror: false, lcd: "off", maxSide: 240, date: new Date(2026, 10, 11, 17, 6), aspect: 3 / 4 }, 1);
    const url = canvas!.toDataURL("image/jpeg", 0.72);
    cache.set(k, url);
    return url;
  });
  chain = job.catch(() => null);
  return job;
}
