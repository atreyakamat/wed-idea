"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Preset } from "@/pixi/engine/types";
import { thumbFor } from "./thumbs";
import { I } from "./icons";
import { press, smooth, snappy, tap } from "./motion";

export interface GalleryItem { preset: Preset; maker: string; mine: boolean }

function Tile({ it, selected, fav, onPick, onFav, onEdit, onHold }: { it: GalleryItem; selected: boolean; fav: boolean; onPick: () => void; onFav: () => void; onEdit?: () => void; onHold: (src: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  // Press and hold to see a look big before committing to it. A hold that turns into a scroll is
  // not a hold, so any movement cancels it.
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const stopHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  const startHold = () => {
    held.current = false;
    stopHold();
    hold.current = setTimeout(() => { if (src) { held.current = true; tap(12); onHold(src); } }, 420);
  };
  useEffect(() => stopHold, []);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let dead = false;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { io.disconnect(); thumbFor(it.preset).then((u) => !dead && setSrc(u)).catch(() => {}); }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => { dead = true; io.disconnect(); };
  }, [it.preset]);

  return (
    <div ref={ref} className="relative">
      <motion.button whileTap={press} transition={snappy}
        onClick={() => { if (held.current) { held.current = false; return; } tap(); onPick(); }}
        onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold} onPointerMove={stopHold}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`Use ${it.preset.name}`}
        className="block w-full touch-manipulation select-none overflow-hidden rounded-[18px] bg-white/[0.05]">
        <div className="relative aspect-[3/4] w-full">
          {src
            ? <motion.img src={src} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="h-full w-full object-cover" />
            : <div className="h-full w-full bg-white/[0.04]" />}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 text-left">
            <div className="truncate text-[0.8125rem] font-semibold leading-tight">{it.preset.name}</div>
            <div className="truncate text-[0.6875rem] text-white/55">{it.maker}</div>
          </div>
          <motion.span animate={{ opacity: selected ? 1 : 0 }} transition={smooth} className="pointer-events-none absolute inset-0 rounded-[18px]" style={{ boxShadow: "inset 0 0 0 2px var(--accent)" }} />
        </div>
      </motion.button>
      <div className="absolute right-1.5 top-1.5 flex gap-1">
        {onEdit && (
          <motion.button whileTap={press} transition={snappy} aria-label={`Edit ${it.preset.name}`} onClick={() => { tap(); onEdit(); }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md"><I n="pencil" className="h-[15px] w-[15px]" /></motion.button>
        )}
        <motion.button whileTap={press} transition={snappy} aria-label={fav ? "Remove from favourites" : "Add to favourites"} aria-pressed={fav} onClick={() => { tap(); onFav(); }}
          className={`flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-md ${fav ? "text-[var(--accent)]" : "text-white/70"}`}>
          <I n="star" className="h-[15px] w-[15px]" w={fav ? 2.6 : 1.7} />
        </motion.button>
      </div>
    </div>
  );
}

export function Gallery({ items, selectedId, favs, recentIds, onPick, onFav, onEdit, onNew, onShare, onSettings, onLearn, onProfile, avatar }: {
  items: GalleryItem[]; selectedId: string; favs: string[]; recentIds: string[];
  onPick: (id: string) => void; onFav: (id: string) => void; onShare: () => void; onSettings: () => void; onLearn: () => void;
  onProfile: () => void; avatar: string | null;
  /** The look builder. Absent unless Advanced is on in Settings. */
  onEdit?: (id: string) => void; onNew?: () => void;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("All");
  const [peek, setPeek] = useState<{ src: string; name: string; maker: string } | null>(null);
  const makers = useMemo(() => ["All", ...(recentIds.length >= 3 ? ["Most used"] : []), "Favourites", ...(items.some((i) => i.mine) ? ["My Looks"] : []), ...Array.from(new Set(items.filter((i) => !i.mine).map((i) => i.maker)))], [items, recentIds.length]);
  const SPECIAL = ["All", "Most used", "Favourites", "My Looks"];
  let list = items.filter((i) => {
    if (tab === "Most used" && !recentIds.includes(i.preset.id)) return false;
    if (tab === "Favourites" && !favs.includes(i.preset.id)) return false;
    if (tab === "My Looks" && !i.mine) return false;
    if (!SPECIAL.includes(tab) && i.maker !== tab) return false;
    const s = q.trim().toLowerCase();
    return !s || i.preset.name.toLowerCase().includes(s) || i.preset.family.toLowerCase().includes(s) || i.preset.blurb.toLowerCase().includes(s);
  });
  // The looks a person actually reaches for come first, so the shelf learns from use.
  if (tab === "Most used") list = [...list].sort((a, b) => recentIds.indexOf(a.preset.id) - recentIds.indexOf(b.preset.id));

  return (
    <section className="pb-6">
      <header className="safe-t flex items-center justify-between px-4 pb-2 pt-3">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">Studio</h1>
        <div className="flex gap-2">
          <motion.button whileTap={press} transition={snappy} onClick={() => { tap(); onProfile(); }} aria-label="Your profile" className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/[0.09]">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <I n="user" className="h-[18px] w-[18px]" />}
          </motion.button>
          <motion.button whileTap={press} transition={snappy} onClick={() => { tap(); onLearn(); }} aria-label="Learn what Pixi can do" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09]"><I n="search" className="h-[18px] w-[18px]" /></motion.button>
          <motion.button whileTap={press} transition={snappy} onClick={onSettings} aria-label="Settings" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09]"><I n="gear" className="h-[18px] w-[18px]" /></motion.button>
          <motion.button whileTap={press} transition={snappy} onClick={onShare} aria-label="Share and receive looks" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09]"><I n="share" className="h-[18px] w-[18px]" /></motion.button>
          {onNew && <motion.button whileTap={press} transition={snappy} onClick={() => { tap(); onNew(); }} aria-label="Create a new look" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black"><I n="plus" className="h-[18px] w-[18px]" w={2.2} /></motion.button>}
        </div>
      </header>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.08] px-3">
          <I n="search" className="h-[17px] w-[17px] shrink-0 text-white/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search looks" className="min-w-0 flex-1 bg-transparent py-2.5 text-[0.9375rem] outline-none placeholder:text-white/35" />
          {q && <button onClick={() => setQ("")} aria-label="Clear search" className="text-white/40"><I n="close" className="h-4 w-4" /></button>}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-4" style={{ scrollbarWidth: "none" }}>
        {makers.map((m) => (
          <button key={m} onClick={() => { tap(); setTab(m); }} className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium transition-colors ${tab === m ? "bg-white text-black" : "bg-white/[0.08] text-white/70"}`}>{m}</button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="px-10 py-16 text-center text-[0.9375rem] leading-relaxed text-white/40">{tab === "Favourites" ? "Tap the star on any look to keep it here." : tab === "Most used" ? "The looks you use most will collect here." : "No looks match that search."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4">
          {list.map((it) => (
            <Tile key={it.preset.id} it={it} selected={it.preset.id === selectedId} fav={favs.includes(it.preset.id)}
              onPick={() => onPick(it.preset.id)} onFav={() => onFav(it.preset.id)} onEdit={onEdit ? () => onEdit(it.preset.id) : undefined}
              onHold={(src) => setPeek({ src, name: it.preset.name, maker: it.maker })} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {peek && (
          <motion.div key="peek" role="dialog" aria-label={`${peek.name} preview`}
            className="fixed inset-0 z-[65] flex flex-col items-center justify-center bg-black/92 px-6 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={() => setPeek(null)}>
            <motion.img src={peek.src} alt="" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} transition={smooth}
              className="max-h-[70vh] w-full max-w-[430px] rounded-[20px] object-contain shadow-[0_20px_60px_rgba(0,0,0,.8)]" />
            <div className="pt-4 text-center">
              <div className="text-[1.25rem] font-semibold">{peek.name}</div>
              <div className="text-[0.8125rem] text-white/45">{peek.maker}</div>
              <div className="pt-3 text-[0.75rem] text-white/30">Tap anywhere to close</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
