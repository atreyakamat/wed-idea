"use client";
import { useEffect, useRef } from "react";
import { CameraIcon } from "./CameraIcon";
import type { CameraDef } from "./cameras";
import { tap } from "./motion";

const W = 70, GAP = 14, STEP = W + GAP;

/** Swipe the shelf of cameras. The one under the marker is live; neighbours shrink and dim. */
export function CameraCarousel({ items, value, onPick }: { items: CameraDef[]; value: string; onPick: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const self = useRef(false);
  const raf = useRef(0);
  const idxOf = (id: string) => Math.max(0, items.findIndex((c) => c.preset.id === id));

  const paint = () => {
    const el = ref.current; if (!el) return;
    const c = el.scrollLeft / STEP;
    const kids = el.children;
    for (let i = Math.max(0, Math.floor(c) - 3); i <= Math.min(kids.length - 1, Math.ceil(c) + 3); i++) {
      const d = Math.min(1, Math.abs(i - c));
      const k = kids[i] as HTMLElement;
      k.style.transform = `scale(${1 - d * 0.26})`;
      k.style.opacity = String(1 - d * 0.62);
    }
  };

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const want = idxOf(value) * STEP;
    if (Math.abs(el.scrollLeft - want) < 3) { paint(); return; }
    self.current = true;
    el.scrollTo({ left: want, behavior: "smooth" });
    const t = setTimeout(() => { self.current = false; paint(); }, 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial scroll position only
  useEffect(() => { const el = ref.current; if (el) { el.scrollLeft = idxOf(value) * STEP; paint(); } }, []);

  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(paint);
    if (self.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = ref.current; if (!el) return;
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / STEP)));
      if (items[i] && items[i].preset.id !== value) { tap(); onPick(items[i].preset.id); }
    }, 100);
  };

  return (
    <div className="relative">
      <div ref={ref} onScroll={onScroll} className="flex snap-x snap-mandatory items-center overflow-x-auto"
        style={{ gap: GAP, paddingLeft: `calc(50% - ${W / 2}px)`, paddingRight: `calc(50% - ${W / 2}px)`, scrollbarWidth: "none", WebkitMaskImage: "linear-gradient(90deg,transparent,#000 15%,#000 85%,transparent)" }}>
        {items.map((c) => (
          <button key={c.preset.id} aria-label={`${c.brand} ${c.model}`} onClick={() => onPick(c.preset.id)}
            className="gpu h-[50px] shrink-0 snap-center" style={{ width: W, opacity: 0.4 }}>
            <CameraIcon body={c.body} color={c.color} />
          </button>
        ))}
      </div>
    </div>
  );
}
