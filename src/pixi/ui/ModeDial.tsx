"use client";
import { useEffect, useRef } from "react";
import { MODES, type ModeId } from "./modes";
import { tap } from "./motion";

/** Mode ticker. Drag it or tap a label; the centre one is live. */
export function ModeDial({ mode, onChange, disabled }: { mode: ModeId; onChange: (m: ModeId) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const self = useRef(false);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-m="${mode}"]`);
    if (!el || !ref.current) return;
    const want = el.offsetLeft + el.offsetWidth / 2 - ref.current.clientWidth / 2;
    if (Math.abs(ref.current.scrollLeft - want) < 2) return;
    self.current = true;
    ref.current.scrollTo({ left: want, behavior: "smooth" });
    const t = setTimeout(() => { self.current = false; }, 420);
    return () => clearTimeout(t);
  }, [mode]);

  const onScroll = () => {
    if (self.current || disabled) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current; if (!el) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best: ModeId = mode, dist = Infinity;
      el.querySelectorAll<HTMLElement>("[data-m]").forEach((k) => {
        const d = Math.abs(k.offsetLeft + k.offsetWidth / 2 - mid);
        if (d < dist) { dist = d; best = k.dataset.m as ModeId; }
      });
      if (best !== mode) { tap(); onChange(best); }
    }, 90);
  };

  return (
    <div className="relative">
      <div ref={ref} onScroll={onScroll} className="flex overflow-x-auto px-[50%]" style={{ scrollbarWidth: "none", WebkitMaskImage: "linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)" }}>
        {MODES.map((m) => (
          <button key={m.id} data-m={m.id} disabled={disabled} onClick={() => { tap(); onChange(m.id); }}
            className={`shrink-0 whitespace-nowrap px-3.5 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.13em] transition-colors duration-200 ${mode === m.id ? "text-[var(--accent)]" : "text-white/45"}`}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
