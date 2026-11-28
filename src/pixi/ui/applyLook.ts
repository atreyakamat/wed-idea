import { RetroRenderer } from "@/pixi/engine/renderer";
import type { Preset } from "@/pixi/engine/types";

let r: RetroRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
let stage: HTMLCanvasElement | null = null;
let chain: Promise<unknown> = Promise.resolve();

/**
 * Puts a look through the same engine the camera uses, on a photo that already exists.
 * Work is queued so filling a whole strip never blocks the interface.
 */
export function applyLook(blob: Blob, preset: Preset | null, maxSide = 1000): Promise<ImageBitmap> {
  const job = chain.then(async () => {
    const src = await createImageBitmap(blob);
    if (!preset) return src;
    try {
      if (!canvas) { canvas = document.createElement("canvas"); r = new RetroRenderer(canvas); r.warmUp(); }
      // WebGL ignores UNPACK_FLIP_Y for ImageBitmaps, so a bitmap would come out upside down.
      // A canvas copy uploads the same way as the camera's video frames.
      if (!stage) stage = document.createElement("canvas");
      stage.width = src.width; stage.height = src.height;
      stage.getContext("2d")!.drawImage(src, 0, 0);
      r!.setSource(stage, stage.width, stage.height);
      r!.render({ preset: { ...preset, overlays: preset.overlays ?? [] }, intensity: 1, mirror: false, lcd: "off", maxSide, aspect: src.width / src.height, date: new Date() }, 1);
      const out = await createImageBitmap(canvas);
      src.close();
      return out;
    } catch {
      return src; // a GL failure must still give the strip a photo to show
    }
  });
  chain = job.catch(() => null);
  return job;
}
