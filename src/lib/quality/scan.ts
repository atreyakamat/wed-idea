// Browser side of the miss finder: one worker, photos checked in turn.
import { decodeUrl } from "@/lib/looks/client";
import type { QualityReply, QualityRequest, QualityResult } from "./quality.worker";

/** Photos are checked at this size (the stored thumbnail is 900 px). */
const CHECK_EDGE = 900;

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (reply: QualityReply) => void>();

function qualityWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./quality.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<QualityReply>) => {
    const done = waiting.get(event.data.id);
    waiting.delete(event.data.id);
    done?.(event.data);
  };
  return worker;
}

/** Checks one photo (by its link). */
export async function checkPhoto(url: string, signal?: AbortSignal): Promise<QualityResult> {
  const pixels = await decodeUrl(url, CHECK_EDGE, signal);
  const id = nextId++;
  const reply = await new Promise<QualityReply>((resolve) => {
    waiting.set(id, resolve);
    const request: QualityRequest = { id, ...pixels };
    qualityWorker().postMessage(request, [pixels.rgba.buffer]);
  });
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}
