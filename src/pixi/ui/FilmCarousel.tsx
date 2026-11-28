"use client";
import { useEffect, useRef, useState } from "react";
import { FILMS, type FilmStock } from "@/pixi/presets/films";

const W = 112, GAP = 12;

function Canister({ f, active }: { f: FilmStock | null; active: boolean }) {
  if (!f) {
    return (
      <div className={`flex h-[168px] w-[112px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 text-[0.8125rem] text-white/45 transition ${active ? "scale-100 opacity-100" : "scale-90 opacity-60"}`}>
        <div className="mb-2 text-2xl">∅</div>No film<div className="mt-1 text-[0.6875rem] text-white/35">camera colour</div>
      </div>
    );
  }
  return (
    <div className={`transition duration-200 ${active ? "scale-100 opacity-100" : "scale-90 opacity-60"}`}>
      <svg viewBox="0 0 112 168" width={W} height={168} aria-hidden>
        <rect x="14" y="6" width="84" height="12" rx="4" fill="#9a9ca3" />
        <rect x="26" y="0" width="60" height="10" rx="3" fill="#c3c5cb" />
        <rect x="10" y="16" width="92" height="136" rx="10" fill={f.body} />
        <rect x="10" y="16" width="14" height="136" rx="7" fill="#fff" opacity=".12" />
        <rect x="18" y="38" width="76" height="82" rx="6" fill={f.label} />
        <text x="56" y="56" textAnchor="middle" fontSize="8" fontWeight="700" fill="#111" opacity=".75">{f.maker.toUpperCase()}</text>
        <text x="56" y="82" textAnchor="middle" fontSize="15" fontWeight="800" fill="#111">{f.name.length > 11 ? f.name.split(" ")[0] : f.name}</text>
        {f.name.length > 11 && <text x="56" y="96" textAnchor="middle" fontSize="11" fontWeight="700" fill="#111">{f.name.split(" ").slice(1).join(" ")}</text>}
        <text x="56" y="112" textAnchor="middle" fontSize="9" fill="#111" opacity=".8">ISO {f.iso}</text>
        <rect x="14" y="150" width="84" height="10" rx="4" fill="#9a9ca3" />
      </svg>
    </div>
  );
}

export function FilmCarousel({ value, onPick }: { value: string | null; onPick: (f: FilmStock | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const items: (FilmStock | null)[] = [null, ...FILMS];
  const [active, setActive] = useState(() => Math.max(0, items.findIndex((f) => (f?.id ?? null) === value)));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmatic = useRef(false);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    programmatic.current = true;
    el.scrollTo({ left: active * (W + GAP), behavior: "auto" });
    setTimeout(() => (programmatic.current = false), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const idx = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / (W + GAP))));
    setActive(idx);
    if (programmatic.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onPick(items[idx]), 140);
  };

  const sel = items[active];
  return (
    <div>
      <div ref={ref} onScroll={onScroll} className="flex snap-x snap-mandatory items-center overflow-x-auto py-2" style={{ gap: GAP, paddingLeft: `calc(50% - ${W / 2}px)`, paddingRight: `calc(50% - ${W / 2}px)`, scrollbarWidth: "none" }}>
        {items.map((f, i) => (
          <button key={f?.id ?? "none"} className="shrink-0 snap-center" style={{ width: W }} onClick={() => ref.current?.scrollTo({ left: i * (W + GAP), behavior: "smooth" })} aria-label={f ? `${f.maker} ${f.name}` : "No film"}>
            <Canister f={f} active={i === active} />
          </button>
        ))}
      </div>
      <div className="px-4 text-center">
        <div className="text-[0.9375rem] font-semibold">{sel ? `${sel.maker} ${sel.name}` : "No film"}</div>
        <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/35">{sel ? `${sel.kind} · ISO ${sel.iso}` : "Using the camera's own colour"}</div>
        <p className="mx-auto mt-1 max-w-[80%] text-[0.8125rem] leading-relaxed text-white/45">{sel?.blurb ?? "Swipe to load a roll. Film replaces the camera's colour and grain, and keeps its lens character."}</p>
      </div>
    </div>
  );
}
