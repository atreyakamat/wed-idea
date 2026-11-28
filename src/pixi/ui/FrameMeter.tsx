"use client";
import { useEffect, useState } from "react";
import { BUDGET, report, type PerfReport } from "./perf";

/** A small readout over the viewfinder: frame rate, worst frames, shutter latency. Green when inside budget. */
export function FrameMeter() {
  const [r, setR] = useState<PerfReport | null>(null);
  useEffect(() => { const t = setInterval(() => setR(report()), 500); return () => clearInterval(t); }, []);
  if (!r || !r.frames) return null;
  const ok = (v: number, max: number) => (v && v <= max ? "text-[#30d158]" : "text-[#ff9f0a]");
  return (
    <div aria-hidden className="lcd pointer-events-none absolute right-3 top-3 rounded-lg bg-black/65 px-2 py-1.5 text-[0.6875rem] leading-[1.35] backdrop-blur-md">
      <div className={ok(r.medianMs, BUDGET.frameMs + 0.5)}>{r.fps} FPS · {r.medianMs} MS</div>
      <div className={ok(r.p95Ms, BUDGET.frameMs * 2)}>P95 {r.p95Ms} · JANK {r.jank}</div>
      {r.feedbackMs > 0 && <div className={ok(r.feedbackMs, BUDGET.feedbackMs)}>SHUTTER {r.feedbackMs} / {r.savedMs || "…"} MS</div>}
    </div>
  );
}
