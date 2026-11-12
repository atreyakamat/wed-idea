/// <reference lib="webworker" />
// Runs the looks engine off the main thread, so the page stays smooth while
// photos are measured and rendered.
import { getLook, type Group } from "./data";
import { plan, render, type StylePrefs } from "./engine";
import type { Features } from "./features";
import { fromRgba, toRgba } from "./image";
import { seedFrom } from "./render";

export type WorkerRequest =
  | { id: number; kind: "plan"; rgba: Uint8ClampedArray; width: number; height: number; group?: Group; style?: StylePrefs; lookId?: string }
  | { id: number; kind: "render"; rgba: Uint8ClampedArray; width: number; height: number; features: Features; group: Group; lookId: string; strength: number; seed: string };

export type PlanReply = { group: Group; lookId: string; strength: number; features: Features; scores: Record<string, number> };
export type WorkerReply = { id: number; ok: true; plan?: PlanReply; rgba?: Uint8ClampedArray } | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    const image = fromRgba(msg.rgba, msg.width, msg.height);
    if (msg.kind === "plan") {
      const p = plan(image, { group: msg.group, style: msg.style, lookId: msg.lookId });
      const reply: WorkerReply = { id: msg.id, ok: true, plan: { group: p.lighting.group, lookId: p.look.id, strength: p.strength, features: p.features, scores: p.scores } };
      scope.postMessage(reply);
      return;
    }
    const out = toRgba(render(image, msg.features, msg.group, getLook(msg.lookId), msg.strength, seedFrom(msg.seed)));
    const reply: WorkerReply = { id: msg.id, ok: true, rgba: out };
    scope.postMessage(reply, [out.buffer]);
  } catch (e) {
    scope.postMessage({ id: msg.id, ok: false, error: (e as Error).message } satisfies WorkerReply);
  }
};
