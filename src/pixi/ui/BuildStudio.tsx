"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Preset } from "@/pixi/engine/types";
import { isCarousel, layoutSize, layoutToBlob, renderLayout, type Layout, type LayoutPhoto } from "./layouts";
import { LAYOUTS, layoutById } from "./layoutTemplates";
import { applyLook } from "./applyLook";
import { I } from "./icons";
import { fade, press, smooth, snappy, tap } from "./motion";
import { ext, mime, type Settings } from "./settings";

export interface BuildSource { id: string; url: string; blob: Blob; kind: "photo" | "video" }

/**
 * Everything the person has arranged, as plain data. Photos are referenced by id, never held here,
 * so a snapshot costs nothing — which is what makes undo possible.
 */
interface Doc {
  tplId: string;
  /** One entry per window. A carousel has no gaps: its list is simply the pages, in order. */
  srcs: (string | null)[];
  looks: (string | null)[];
  caps: string[];
  values: Record<string, string>;
}

interface Props {
  roll: BuildSource[];
  looks: { preset: Preset; maker: string }[];
  recentLookIds: string[];
  settings: Settings;
  setPair: (on: boolean) => void;
  setSign: (on: boolean) => void;
  /** The profile handle, without the @. Empty when there is no profile yet. */
  handle: string;
  onOpenProfile: () => void;
  /** Photos chosen in the Roll, filled in as soon as the screen opens. */
  seed?: string[];
  onOpenCamera: () => void;
  onImportPhotos: (files: FileList | null) => void;
  /** Saves the finished pages into the roll, and to the phone when the person has asked for that. */
  onExport: (blobs: Blob[], extension: string) => Promise<void>;
  onShare: (blobs: Blob[], extension: string) => Promise<void>;
}

type Tab = "frame" | "photos" | "look" | "text";
const TABS: [Tab, string][] = [["frame", "Frame"], ["photos", "Photos"], ["look", "Look"], ["text", "Text"]];
const FAMILY_ORDER = ["Carousel", "Booth", "Ticket", "Film", "Card", "Sheet", "Print", "Paper", "Vintage", "Modern"];
/** The six frames most people want. The rest are one tap away under More. */
const FEATURED = ["ca-instant", "ca-glass", "ca-noir", "st-classic", "st-grid", "pr-stickers"];
/** Instagram takes this many photos in one post; longer sets are posted in parts. */
const IG_PER_POST = 20;

/**
 * What Build opens with when nothing was sent over: the frame that fits how many photos were
 * taken recently, already filled with the newest ones. One tap on Save and it is done.
 */
function smartStart(photoIds: string[]): Doc {
  const pick = photoIds.length >= 5 ? "ca-instant" : "st-classic";
  const t = layoutById(pick);
  if (isCarousel(t)) {
    const take = photoIds.slice(0, 10);
    return { tplId: pick, srcs: take, looks: take.map(() => null), caps: take.map(() => ""), values: {} };
  }
  const n = t.slots.length;
  return { ...blank(pick, n), srcs: Array.from({ length: n }, (_, i) => photoIds[i] ?? null) };
}

const bmpKey = (src: string, look: string | null) => `${src}|${look ?? "-"}`;
const blank = (tplId: string, n: number): Doc => ({ tplId, srcs: Array(n).fill(null), looks: Array(n).fill(null), caps: Array(n).fill(""), values: {} });

export function BuildStudio({ roll, looks, recentLookIds, settings, setPair, setSign, handle, onOpenProfile, seed, onOpenCamera, onImportPhotos, onExport, onShare }: Props) {
  // History and position move together as one value. Kept apart, two edits in the same tick leave
  // the position pointing past the end of the list, and the screen has nothing to render.
  const [past, setPast] = useState<{ docs: Doc[]; at: number }>(() => ({ docs: [smartStart(roll.filter((r) => r.kind === "photo").map((r) => r.id))], at: 0 }));
  const [allFrames, setAllFrames] = useState(false);
  const [tab, setTab] = useState<Tab>("photos");
  const [slot, setSlot] = useState(0);
  const [busy, setBusy] = useState("");
  const [tick, setTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Rendered photos, keyed by source and look. Shared across undo steps, so going back is instant. */
  const cache = useRef(new Map<string, ImageBitmap>());

  const { docs, at } = past;
  const doc = docs[at];
  const tpl = useMemo(() => layoutById(doc.tplId), [doc.tplId]);
  const sign = settings.sign && handle ? `@${handle}` : undefined;
  const carousel = isCarousel(tpl);
  const maxPages = tpl.slides?.max ?? tpl.slots.length;
  const photos = useMemo(() => roll.filter((r) => r.kind === "photo"), [roll]);

  /** Every change goes through here, which is what gives the screen an undo stack. */
  const edit = useCallback((f: (d: Doc) => Doc) => {
    setPast((st) => {
      const made = f(st.docs[st.at]);
      if (made === st.docs[st.at]) return st; // a refused change is not a step to undo
      const next = [...st.docs.slice(0, st.at + 1), made].slice(-30);
      return { docs: next, at: next.length - 1 };
    });
  }, []);

  const undo = useCallback(() => setPast((s) => ({ ...s, at: Math.max(0, s.at - 1) })), []);
  const redo = useCallback(() => setPast((s) => ({ ...s, at: Math.min(s.docs.length - 1, s.at + 1) })), []);
  const canUndo = at > 0, canRedo = at < docs.length - 1;

  useEffect(() => () => { cache.current.forEach((b) => b.close()); cache.current.clear(); }, []);

  // Photos sent over from the Roll land in the windows straight away.
  const seedKey = seed?.join(",") ?? "";
  useEffect(() => {
    if (!seedKey) return;
    const ids = seedKey.split(",").filter(Boolean);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new seed from the Roll replaces the document
    setPast({ docs: [{ ...blank(LAYOUTS[0].id, LAYOUTS[0].slots.length), srcs: Array.from({ length: LAYOUTS[0].slots.length }, (_, i) => ids[i] ?? null) }], at: 0 });
    setSlot(0);
  }, [seedKey]);

  /** Renders anything the page needs but has not drawn yet, one photo at a time. */
  // A carousel can be any length, so only the page on screen and its neighbours are kept decoded;
  // strips and sheets need all their windows at once. Everything else is released.
  const near = (i: number) => !carousel || Math.abs(i - slot) <= 1;
  const wanted = doc.srcs.map((s, i) => (s && near(i) ? bmpKey(s, doc.looks[i]) : "")).join("~");
  useEffect(() => {
    let dead = false;
    const need = doc.srcs.map((s, i) => ({ s, k: s ? bmpKey(s, doc.looks[i]) : "", i })).filter((x) => x.s && near(x.i));
    const keep = new Set(need.map((x) => x.k));
    for (const [k, b] of cache.current) if (!keep.has(k) && cache.current.size > 16) { b.close(); cache.current.delete(k); }
    const missing = need.filter((x) => !cache.current.has(x.k));
    if (!missing.length) return;
    void (async () => {
      // Flipping pages loads quietly; only a real batch (a new look across a strip) says so.
      if (missing.length > 2) setBusy("Applying…");
      try {
        for (const m of missing) {
          const src = roll.find((r) => r.id === m.s);
          if (!src || dead) continue;
          const lk = doc.looks[m.i];
          const preset = lk ? looks.find((l) => l.preset.id === lk)?.preset ?? null : null;
          let bmp: ImageBitmap;
          try { bmp = await applyLook(src.blob, preset); } catch { continue; } // an unreadable photo leaves its page empty; the others still load
          if (dead) { bmp.close(); return; }
          cache.current.set(m.k, bmp);
          setTick((t) => t + 1);
        }
      } finally { if (!dead) setBusy(""); }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, roll, looks]);

  const bmpAt = useCallback((i: number): LayoutPhoto | null => {
    const s = doc.srcs[i];
    if (!s) return null;
    const b = cache.current.get(bmpKey(s, doc.looks[i]));
    return b ? { src: b, w: b.width, h: b.height } : null;
  }, [doc]);

  const pages = doc.srcs.filter(Boolean).length;
  const cap = carousel ? Math.max(doc.srcs.length, 1) : tpl.slots.length;

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    if (carousel) {
      const i = Math.min(slot, Math.max(doc.srcs.length - 1, 0));
      renderLayout(c, { template: tpl, photos: [bmpAt(i)], values: doc.values, sign, scale: 1, placeholder: true, slide: { index: i + 1, total: Math.max(doc.srcs.length, 1), caption: doc.caps[i] ?? "" } });
    } else {
      renderLayout(c, { template: tpl, photos: tpl.slots.map((_, i) => bmpAt(i)), values: doc.values, sign, scale: 1, placeholder: true });
    }
  }, [tpl, carousel, slot, doc, bmpAt, sign]);

  useEffect(() => { draw(); }, [draw, tick]);

  /* ---------- editing ---------- */

  const pickFrame = (id: string) => {
    const next = layoutById(id);
    edit((d) => {
      if (isCarousel(next)) {
        const keep = d.srcs.filter(Boolean) as string[];
        const take = keep.slice(0, next.slides?.max ?? 10);
        return { tplId: id, srcs: take.length ? take : [], looks: take.map((_, i) => d.looks[i] ?? null), caps: take.map((_, i) => d.caps[i] ?? ""), values: {} };
      }
      const n = next.slots.length;
      const keep = d.srcs.filter(Boolean) as string[];
      return { tplId: id, srcs: Array.from({ length: n }, (_, i) => keep[i] ?? null), looks: Array.from({ length: n }, (_, i) => d.looks[i] ?? null), caps: Array.from({ length: n }, (_, i) => d.caps[i] ?? ""), values: {} };
    });
    setSlot(0);
  };

  /**
   * Carousel: a tap adds the photo as a page, or takes it out again. Strip: it fills the chosen
   * window. Every check happens inside the update, so several quick taps cannot run past the cap.
   */
  const pickPhoto = (src: BuildSource) => {
    if (carousel) {
      edit((d) => {
        const i = d.srcs.indexOf(src.id);
        if (i >= 0) return { ...d, srcs: d.srcs.filter((_, k) => k !== i), looks: d.looks.filter((_, k) => k !== i), caps: d.caps.filter((_, k) => k !== i) };
        if (d.srcs.length >= maxPages) return d;
        const look = d.looks[d.looks.length - 1] ?? null; // a new page matches the ones before it
        return { ...d, srcs: [...d.srcs, src.id], looks: [...d.looks, look], caps: [...d.caps, ""] };
      });
      return;
    }
    edit((d) => { const a = [...d.srcs]; a[slot] = src.id; return { ...d, srcs: a }; });
    setSlot((s) => Math.min(s + 1, tpl.slots.length - 1));
  };

  // The page in view follows the one just added, and never points past the end after a removal.
  const len = doc.srcs.length;
  const prevLen = useRef(len);
  useEffect(() => {
    if (carousel && len > prevLen.current) setSlot(len - 1);
    else setSlot((s) => Math.min(s, Math.max(len - 1, 0)));
    prevLen.current = len;
  }, [len, carousel]);

  const clearSlot = (i: number) => edit((d) => {
    if (carousel) return { ...d, srcs: d.srcs.filter((_, k) => k !== i), looks: d.looks.filter((_, k) => k !== i), caps: d.caps.filter((_, k) => k !== i) };
    const a = [...d.srcs]; a[i] = null; return { ...d, srcs: a };
  });

  /** Moves the chosen window one place along, taking its look and caption with it. */
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cap) return;
    edit((d) => {
      const sw = <T,>(a: T[]) => { const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; };
      return { ...d, srcs: sw(d.srcs), looks: sw(d.looks), caps: sw(d.caps) };
    });
    setSlot(j);
  };

  const fillRest = () => {
    const used = new Set(doc.srcs.filter(Boolean));
    const pool = photos.filter((p) => !used.has(p.id));
    if (!pool.length) return;
    edit((d) => {
      if (carousel) {
        const room = maxPages - d.srcs.length;
        const take = pool.slice(0, Math.max(room, 0));
        const look = d.looks[d.looks.length - 1] ?? null;
        return { ...d, srcs: [...d.srcs, ...take.map((p) => p.id)], looks: [...d.looks, ...take.map(() => look)], caps: [...d.caps, ...take.map(() => "")] };
      }
      const a = [...d.srcs]; const lk = [...d.looks];
      let k = 0;
      for (let i = 0; i < a.length && k < pool.length; i++) if (!a[i]) { a[i] = pool[k++].id; lk[i] = lk[i] ?? d.looks.find(Boolean) ?? null; }
      return { ...d, srcs: a, looks: lk };
    });
  };

  /** A look lands on every page, or only the one in front of you. */
  const [lookScope, setLookScope] = useState<"all" | "one">("all");
  const setLook = (id: string | null) => edit((d) => ({
    ...d,
    looks: lookScope === "all" || !carousel ? d.looks.map(() => id) : d.looks.map((l, i) => (i === slot ? id : l)),
  }));
  const print = tpl.kind === "print";
  const currentLook = carousel && lookScope === "one" ? doc.looks[slot] ?? null : doc.looks.find((l) => l !== null) ?? null;

  /* ---------- output ---------- */

  const build = async (): Promise<Blob[]> => {
    const scale = tpl.exportScale ?? 2;
    const c = document.createElement("canvas");
    const out: Blob[] = [];
    if (carousel) {
      // One page at a time: decode, draw, encode, release. Memory stays flat however long the set is.
      const live = doc.srcs.map((s, i) => ({ s, i })).filter((x) => x.s);
      for (let n = 0; n < live.length; n++) {
        if (live.length > 3) setBusy(`Making page ${n + 1} of ${live.length}…`);
        const i = live[n].i;
        let photo = bmpAt(i), mine: ImageBitmap | null = null;
        if (!photo) {
          const src = roll.find((r) => r.id === live[n].s);
          if (!src) continue;
          const lk = doc.looks[i];
          mine = await applyLook(src.blob, lk ? looks.find((l) => l.preset.id === lk)?.preset ?? null : null);
          photo = { src: mine, w: mine.width, h: mine.height };
        }
        renderLayout(c, { template: tpl, photos: [photo], values: doc.values, sign, scale, slide: { index: n + 1, total: live.length, caption: doc.caps[i] ?? "" } });
        out.push(await layoutToBlob(c, mime(settings), settings.quality));
        mine?.close();
      }
    } else if (print) {
      // Prints are lossless so cut lines and crop marks stay crisp at 300 DPI.
      renderLayout(c, { template: tpl, photos: tpl.slots.map((_, i) => bmpAt(i)), values: doc.values, sign, scale });
      out.push(await layoutToBlob(c, "image/png"));
    } else {
      renderLayout(c, { template: tpl, photos: tpl.slots.map((_, i) => bmpAt(i)), values: doc.values, sign, scale, pair: settings.stripPair });
      out.push(await layoutToBlob(c, mime(settings), settings.quality));
    }
    return out;
  };

  const run = async (what: "export" | "share") => {
    setBusy(carousel ? "Making your carousel…" : print ? "Making your print at 300 DPI…" : "Making your strip…");
    try {
      const blobs = await build();
      if (!blobs.length) return;
      const e = print ? "png" : ext(settings);
      await (what === "export" ? onExport(blobs, e) : onShare(blobs, e));
    } catch { setBusy(""); }
    finally { setBusy(""); }
  };

  // Tap a window in the preview to choose which one you are filling.
  const pickSlot = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (carousel) return;
    const c = canvasRef.current; if (!c) return;
    const box = c.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * tpl.w;
    const y = ((e.clientY - box.top) / box.height) * tpl.h;
    const i = tpl.slots.findIndex((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
    if (i >= 0) { tap(); setSlot(i); setTab("photos"); }
  };

  const size = layoutSize(tpl, 1);
  const ordered = useMemo(() => {
    const rank = new Map(recentLookIds.map((id, i) => [id, i]));
    return [...looks].sort((a, b) => (rank.get(a.preset.id) ?? 999) - (rank.get(b.preset.id) ?? 999));
  }, [looks, recentLookIds]);
  const frames = useMemo(() => {
    const featured = FEATURED.map((id) => LAYOUTS.find((l) => l.id === id)).filter((l): l is (typeof LAYOUTS)[number] => !!l);
    const rest = [...LAYOUTS].filter((l) => !FEATURED.includes(l.id)).sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));
    // The current frame is always visible, even if it lives under More.
    const cur = rest.find((l) => l.id === doc.tplId);
    return allFrames ? [...featured, ...rest] : cur ? [...featured, cur] : featured;
  }, [allFrames, doc.tplId]);

  const chip = (on: boolean) => `shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[0.8125rem] font-medium transition-colors ${on ? "bg-white text-black" : "bg-white/[0.08] text-white/80"}`;
  const ready = carousel ? pages > 0 : doc.srcs.some(Boolean);
  const fieldList = (tpl.fields ?? []).filter((fd) => !(carousel && fd.key === "caption"));

  return (
    <div className="flex h-full flex-col">
      <header className="safe-t flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-bold leading-none tracking-[-0.02em]">Build</h1>
          <p className="mt-1 truncate text-[0.75rem] text-white/40">
            {carousel ? `${pages} ${pages === 1 ? "page" : "pages"} · ${pages > IG_PER_POST ? `${Math.ceil(pages / IG_PER_POST)} Instagram posts of ${IG_PER_POST}` : "1080×1350"}` : `${tpl.name} · ${tpl.slots.length} photo${tpl.slots.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => { tap(); undo(); }} disabled={!canUndo} aria-label="Undo"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09] disabled:opacity-30"><I n="undo" className="h-[18px] w-[18px]" /></button>
          <button onClick={() => { tap(); redo(); }} disabled={!canRedo} aria-label="Redo"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09] disabled:opacity-30"><I n="redo" className="h-[18px] w-[18px]" /></button>
          {!carousel && !print && (
            <motion.button whileTap={press} transition={snappy} onClick={() => { tap(); setPair(!settings.stripPair); }} aria-pressed={settings.stripPair}
              className={`rounded-full px-3 py-2 text-[0.75rem] font-medium ${settings.stripPair ? "bg-[var(--accent)] text-black" : "bg-white/[0.08] text-white/80"}`}>Pair</motion.button>
          )}
          <motion.button whileTap={press} transition={snappy} onClick={() => run("share")} disabled={!ready || !!busy} aria-label="Share"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09] disabled:opacity-40"><I n="share" className="h-[18px] w-[18px]" /></motion.button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-2">
        <motion.canvas
          ref={canvasRef} width={size.w} height={size.h} onClick={pickSlot}
          drag={carousel && pages > 1 ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.35}
          onDragEnd={(_, info) => {
            if (!carousel) return;
            if (info.offset.x < -60 && slot < doc.srcs.length - 1) { tap(); setSlot(slot + 1); }
            else if (info.offset.x > 60 && slot > 0) { tap(); setSlot(slot - 1); }
          }}
          className={`max-h-full max-w-full rounded-[6px] object-contain shadow-[0_10px_40px_rgba(0,0,0,.6)] ${carousel ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`} />
        {carousel && pages > 1 && (
          <div className="pointer-events-none flex shrink-0 justify-center gap-1.5">
            {doc.srcs.length <= 12
              ? doc.srcs.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === slot ? "w-4 bg-white" : "w-1.5 bg-white/35"}`} />)
              : <span className="lcd rounded-full bg-white/10 px-2.5 py-0.5 text-[0.6875rem] tabular-nums text-white/70">{slot + 1} / {doc.srcs.length}</span>}
          </div>
        )}
        <AnimatePresence>
          {busy && (
            <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}
              className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/75 px-4 py-2 text-[0.8125rem] font-medium backdrop-blur">{busy}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="shrink-0">
        <div className="mx-4 mb-3 flex rounded-xl bg-white/[0.07] p-[3px]">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => { tap(); setTab(k); }} className="relative flex-1 rounded-[9px] py-1.5 text-[0.8125rem] font-medium">
              {tab === k && <motion.span layoutId="build-seg" className="absolute inset-0 rounded-[9px] bg-white/[0.14]" transition={smooth} />}
              <span className={`relative ${tab === k ? "text-white" : "text-white/55"}`}>{l}</span>
            </button>
          ))}
        </div>

        {/* One row shorter than it was, which goes back to the preview. The extra bottom padding
            keeps the last photo clear of the Save button rather than under it. */}
        <div className="h-[10.5rem] max-h-[34dvh] overflow-y-auto overscroll-contain pb-3">
          {tab === "frame" && (
            <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollbarWidth: "none" }}>
              {frames.map((t) => (
                <button key={t.id} onClick={() => { tap(); pickFrame(t.id); }} className="w-[80px] shrink-0 text-center">
                  <div className={`flex h-[116px] items-center justify-center rounded-xl bg-white/[0.06] p-1.5 ${t.id === doc.tplId ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""}`}>
                    <FramePreview id={t.id} />
                  </div>
                  <div className="mt-1 truncate text-[0.6875rem] font-medium">{t.name}</div>
                  <div className="truncate text-[0.6875rem] text-white/35">{t.kind === "carousel" ? "Carousel" : t.kind === "sheet" ? "12 photos" : t.kind === "print" ? `${t.paper} · ${t.slots.length} photo${t.slots.length > 1 ? "s" : ""}` : `${t.slots.length} photo${t.slots.length > 1 ? "s" : ""}`}</div>
                </button>
              ))}
              <button onClick={() => { tap(); setAllFrames((a) => !a); }} aria-expanded={allFrames} className="w-[80px] shrink-0 text-center">
                <div className="flex h-[116px] flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] text-white/60">
                  <I n={allFrames ? "chevL" : "plus"} className="h-5 w-5" w={2} />
                  <span className="text-[0.75rem] font-medium">{allFrames ? "Fewer" : `${LAYOUTS.length - FEATURED.length} more`}</span>
                </div>
                <div className="mt-1 truncate text-[0.6875rem] font-medium">{allFrames ? "Show fewer" : "More frames"}</div>
              </button>
            </div>
          )}

          {tab === "photos" && (
            <div className="space-y-3">
              {/* The pages and what you can do to the one you are on, in a single row. These were two
                  rows, which pushed the photos themselves off the bottom of the screen. */}
              <div className="flex items-center gap-2 px-4">
                {/* Pinned, outside the scroll: with twenty pages these would otherwise sit off the
                    right-hand edge, and acting on the page you are looking at would mean hunting. */}
                {doc.srcs[slot] && (
                  <span className="flex shrink-0 items-center gap-1 border-r border-white/10 pr-2">
                    <button onClick={() => { tap(); move(slot, -1); }} disabled={slot <= 0} aria-label="Move this page earlier"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-[0.9375rem] disabled:opacity-25">←</button>
                    <button onClick={() => { tap(); move(slot, 1); }} disabled={slot >= cap - 1} aria-label="Move this page later"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-[0.9375rem] disabled:opacity-25">→</button>
                    <button onClick={() => { tap(); clearSlot(slot); }} aria-label="Remove this page"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08]"><I n="trash" className="h-[15px] w-[15px]" /></button>
                  </span>
                )}
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                  {Array.from({ length: cap }, (_, i) => (
                    <button key={i} onClick={() => { tap(); setSlot(i); }} aria-label={`${carousel ? "Page" : "Window"} ${i + 1}`}
                      className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/[0.07] text-[0.8125rem] font-semibold ${i === slot ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""}`}>
                      {doc.srcs[i] ? <img src={roll.find((r) => r.id === doc.srcs[i])?.url} alt="" className="h-full w-full object-cover" /> : <span className="text-white/40">{i + 1}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {photos.length === 0 ? (
                <div className="px-4 pt-2 text-center">
                  <p className="text-[0.8125rem] leading-relaxed text-white/45">Your roll is empty. Shoot something, or bring photos in from your phone.</p>
                  <div className="mt-2.5 flex justify-center gap-2">
                    <button onClick={onOpenCamera} className="rounded-full bg-white px-5 py-2.5 text-[0.8125rem] font-semibold text-black">Open the camera</button>
                    <button onClick={() => fileRef.current?.click()} className="rounded-full bg-white/[0.1] px-5 py-2.5 text-[0.8125rem] font-semibold">From phone</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
                  <button onClick={onOpenCamera} className="flex h-[92px] w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.07] text-[0.6875rem] font-medium text-white/70">
                    <I n="camera" className="h-5 w-5" /> Camera
                  </button>
                  <button onClick={() => fileRef.current?.click()} className="flex h-[92px] w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.07] text-[0.6875rem] font-medium text-white/70">
                    <I n="plus" className="h-5 w-5" /> Phone
                  </button>
                  {/* Filling from the roll is a way of getting photos in, so it sits with the other two
                      rather than in a row of its own above. */}
                  <button onClick={() => { tap(); fillRest(); }} aria-label={carousel ? "Add every photo in your roll" : "Fill the empty windows"}
                    className="flex h-[92px] w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.07] text-center text-[0.6875rem] font-medium leading-tight text-white/70">
                    <I n="grid" className="h-5 w-5" />{carousel ? "Add all" : "Fill rest"}
                  </button>
                  {photos.map((p) => {
                    const where = doc.srcs.indexOf(p.id);
                    return (
                      <button key={p.id} onClick={() => { tap(); pickPhoto(p); }} aria-label={where >= 0 ? "Remove this photo" : "Use this photo"}
                        className={`relative h-[92px] w-[70px] shrink-0 overflow-hidden rounded-xl bg-white/[0.05] ${where >= 0 ? "opacity-55" : ""}`}>
                        <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        {where >= 0 && (
                          <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[0.6875rem] font-bold text-black">
                            {carousel ? where + 1 : <I n="check" className="h-3 w-3" w={3} />}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple hidden
                onChange={(e) => { onImportPhotos(e.target.files); e.target.value = ""; }} />
            </div>
          )}

          {tab === "look" && (
            <div className="space-y-2.5">
              {carousel && pages > 1 && (
                <div className="mx-4 flex rounded-xl bg-white/[0.07] p-[3px]">
                  {([["all", "Every page"], ["one", `Page ${slot + 1}`]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => { tap(); setLookScope(k); }} className={`relative flex-1 rounded-[9px] py-1.5 text-[0.75rem] font-medium ${lookScope === k ? "text-white" : "text-white/55"}`}>
                      {lookScope === k && <motion.span layoutId="scope-seg" className="absolute inset-0 rounded-[9px] bg-white/[0.14]" transition={smooth} />}
                      <span className="relative">{l}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 px-4 pb-2">
                <button onClick={() => { tap(); setLook(null); }} className={chip(currentLook === null)}>As shot</button>
                {ordered.slice(0, 40).map((l) => (
                  <button key={l.preset.id} onClick={() => { tap(); setLook(l.preset.id); }} className={chip(currentLook === l.preset.id)}>{l.preset.name}</button>
                ))}
              </div>
            </div>
          )}

          {tab === "text" && (
            <div className="space-y-3 px-4 pb-2">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.07] px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="text-[0.9375rem]">Sign it{handle ? ` @${handle}` : ""}</div>
                  <div className="text-[0.75rem] text-white/45">{handle ? "A small credit in the corner of the photo" : "Add a handle to your profile first"}</div>
                </div>
                {handle
                  ? <button role="switch" aria-checked={settings.sign} aria-label="Sign with your handle" onClick={() => { tap(); setSign(!settings.sign); }} className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${settings.sign ? "bg-[var(--accent)]" : "bg-white/15"}`}><span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform ${settings.sign ? "translate-x-[22px]" : "translate-x-[2px]"}`} /></button>
                  : <button onClick={() => { tap(); onOpenProfile(); }} className="shrink-0 whitespace-nowrap rounded-full bg-white/[0.12] px-3.5 py-1.5 text-[0.8125rem] font-medium">Set up</button>}
              </div>
              {carousel && (
                <label className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/35">Caption · page {slot + 1}</span>
                  <input value={doc.caps[slot] ?? ""} maxLength={60} placeholder="Say something about this one"
                    onChange={(e) => edit((d) => { const a = [...d.caps]; a[slot] = e.target.value; return { ...d, caps: a }; })}
                    className="w-full rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-[0.9375rem] outline-none placeholder:text-white/25 focus:ring-2 focus:ring-[var(--accent)]" />
                </label>
              )}
              {fieldList.length === 0 && !carousel && <p className="text-[0.8125rem] text-white/45">This frame has no text to change.</p>}
              {fieldList.map((fd) => (
                <label key={fd.key} className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/35">{fd.label}</span>
                  <input value={doc.values[fd.key] ?? fd.def} maxLength={fd.max}
                    onChange={(e) => edit((d) => ({ ...d, values: { ...d.values, [fd.key]: e.target.value } }))}
                    className="w-full rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-[0.9375rem] outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pb-2">
          <motion.button whileTap={press} transition={snappy} onClick={() => run("export")} disabled={!ready || !!busy}
            className="w-full rounded-2xl bg-white py-3.5 text-[0.9375rem] font-semibold text-black disabled:opacity-35">
            {!ready ? "Add a photo to start"
              : carousel ? `Save ${pages} ${pages === 1 ? "page" : "pages"}${settings.saveMode === "auto" ? " to roll and phone" : " to roll"}`
                : settings.saveMode === "auto" ? "Save to roll and phone" : "Save to roll"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/** Small drawing of a frame, rendered once per layout so the picker stays cheap. */
function FramePreview({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const t: Layout = layoutById(id);
    const s = layoutSize(t, 1);
    const k = 108 / s.h;
    const tmp = document.createElement("canvas");
    renderLayout(tmp, { template: t, photos: t.slots.map(() => null), scale: 1, placeholder: false, slide: { index: 1, total: 3 } });
    c.width = Math.round(s.w * k); c.height = Math.round(s.h * k);
    const g = c.getContext("2d");
    if (!g) return;
    g.drawImage(tmp, 0, 0, c.width, c.height);
    g.fillStyle = "rgba(255,255,255,.22)";
    for (const sl of t.slots) g.fillRect(sl.x * k, sl.y * k, sl.w * k, sl.h * k);
  }, [id]);
  return <canvas ref={ref} className="max-h-full max-w-full rounded-[3px] object-contain" />;
}
