/**
 * Numbers from the device itself. The render loop reports each frame; the shutter reports how
 * long it took for the photo to appear. Settings reads them back. Nothing leaves the phone.
 *
 * Budgets: a frame every 16.7 ms (60 fps) in the viewfinder and during the develop; under
 * 100 ms from the shutter to the photo appearing on screen; under 300 ms to the full-quality
 * shot being in the roll.
 */
const N = 240;
const intervals = new Float32Array(N);
const work = new Float32Array(N);
let head = 0, count = 0, last = 0;
const latency = { feedback: [] as number[], saved: [] as number[] };

export const BUDGET = { frameMs: 16.7, feedbackMs: 100, savedMs: 300 };

/** Called once per drawn frame with the time spent drawing it. */
export function frame(drawMs: number) {
  const now = performance.now();
  if (last) {
    const gap = now - last;
    // A gap over a second is the app being in the background, not a slow frame.
    if (gap < 1000) { intervals[head] = gap; work[head] = drawMs; head = (head + 1) % N; count = Math.min(N, count + 1); }
  }
  last = now;
}

export function shutterTimings(feedbackMs: number, savedMs?: number) {
  latency.feedback = [...latency.feedback, feedbackMs].slice(-20);
  if (savedMs !== undefined) latency.saved = [...latency.saved, savedMs].slice(-20);
}

const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

export interface PerfReport {
  frames: number; fps: number; medianMs: number; p95Ms: number; drawMs: number; jank: number;
  feedbackMs: number; savedMs: number;
}

export function report(): PerfReport {
  const iv = Array.from(intervals.slice(0, count));
  const wk = Array.from(work.slice(0, count));
  const med = pct(iv, 0.5);
  return {
    frames: count,
    fps: med ? Math.round(1000 / med) : 0,
    medianMs: +med.toFixed(1),
    p95Ms: +pct(iv, 0.95).toFixed(1),
    drawMs: +pct(wk, 0.5).toFixed(1),
    // Frames that took more than two refreshes: the stutters you can see.
    jank: iv.filter((x) => x > BUDGET.frameMs * 2).length,
    feedbackMs: Math.round(pct(latency.feedback, 0.5)),
    savedMs: Math.round(pct(latency.saved, 0.5)),
  };
}

export function resetPerf() { head = 0; count = 0; last = 0; latency.feedback = []; latency.saved = []; }
