"use client";
import { useState } from "react";
import { LAYER_DEFS, defaultParams } from "@/pixi/engine/layerDefs";
import type { GpuLayerKind, LayerSpec, OverlaySpec, Preset } from "@/pixi/engine/types";
import { CATS, GUIDE_STEPS, LAYER_HELP } from "./layerHelp";
import { STAMPS } from "./cameras";
import { presetToLook, type SavedLook } from "./store";
import { AnimatePresence, motion } from "framer-motion";
import { I } from "./icons";
import { fade, press, sheet as sheetT, smooth, snappy, tap } from "./motion";

const FRAMES: { id: string; label: string }[] = [
  { id: "none", label: "No frame" }, { id: "polaroid", label: "Polaroid" }, { id: "thin", label: "Thin border" }, { id: "rounded", label: "Rounded" }, { id: "film", label: "Film strip" },
];

interface Props {
  draft: SavedLook;
  saved: boolean;
  templates: Preset[];
  commit: (l: SavedLook, key?: string) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  onCompare: (on: boolean) => void;
  onSave: (asCopy: boolean) => void;
  onShare: () => void;
  onDelete: () => void;
}

export function Builder({ draft, saved, templates, commit, undo, redo, canUndo, canRedo, onCompare, onSave, onShare, onDelete }: Props) {
  const [open, setOpen] = useState<number | null>(0);
  const [guide, setGuide] = useState(false);
  const [adding, setAdding] = useState(false);
  const set = (layers: LayerSpec[], key?: string) => commit({ ...draft, layers }, key);
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= draft.layers.length) return; const a = [...draft.layers]; [a[i], a[j]] = [a[j], a[i]]; set(a); setOpen(j); };
  const patch = (i: number, p: Partial<LayerSpec>, key?: string) => set(draft.layers.map((l, k) => (k === i ? { ...l, ...p } : l)), key);
  const stampId = (() => { const s = draft.overlays.find((o) => o.kind === "stamp"); if (!s) return "none"; const m = STAMPS.find((x) => x.overlay && x.overlay.kind === "stamp" && s.kind === "stamp" && x.overlay.style === s.style && x.overlay.format === s.format); return m?.id ?? "custom"; })();
  const frameId = (draft.overlays.find((o) => o.kind === "frame") as Extract<OverlaySpec, { kind: "frame" }> | undefined)?.style ?? "none";

  const setStamp = (id: string) => {
    const rest = draft.overlays.filter((o) => o.kind !== "stamp");
    const def = STAMPS.find((s) => s.id === id);
    commit({ ...draft, overlays: def?.overlay ? [...rest, def.overlay] : rest });
  };
  const setFrame = (id: string) => {
    const rest = draft.overlays.filter((o) => o.kind !== "frame");
    commit({ ...draft, overlays: id === "none" ? rest : [...rest, { kind: "frame", style: id as "polaroid", color: "#f4efe6" } as OverlaySpec] });
  };
  const applyTemplate = (id: string) => {
    if (id === "__blank") { commit({ ...draft, layers: [{ kind: "grade", params: defaultParams("grade") }], overlays: [], blurb: "" }); setOpen(0); return; }
    const t = templates.find((p) => p.id === id); if (!t) return;
    const c = presetToLook(t, draft.name);
    commit({ ...draft, layers: c.layers, overlays: c.overlays, aspect: c.aspect, blurb: t.blurb }); setOpen(0);
  };

  const ghost = "shrink-0 rounded-xl bg-white/[0.07] px-3.5 py-2 text-[0.8125rem] font-medium text-white/80 active:bg-white/[0.12] disabled:opacity-30";
  const field = "w-full rounded-xl bg-white/[0.07] px-3.5 py-3 text-[0.9375rem] outline-none placeholder:text-white/30 focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <section className="pb-28">
      <div className="space-y-4 px-4 pt-3">
        <input value={draft.name} onChange={(e) => commit({ ...draft, name: e.target.value.slice(0, 40) }, "name")} placeholder="Name your look" className={`${field} font-semibold`} />

        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <button className={`${ghost} text-[var(--accent)]`} onClick={() => setGuide(true)}>Guide</button>
          <button className={ghost} disabled={!canUndo} onClick={() => { tap(); undo(); }}>Undo</button>
          <button className={ghost} disabled={!canRedo} onClick={() => { tap(); redo(); }}>Redo</button>
          <button className={`${ghost} touch-none select-none`} onPointerDown={() => onCompare(true)} onPointerUp={() => onCompare(false)} onPointerLeave={() => onCompare(false)} onPointerCancel={() => onCompare(false)}>Hold to compare</button>
          <select aria-label="Start from a template" className={`${ghost} max-w-[42%] appearance-none`} value="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
            <option value="">Start from…</option>
            <option value="__blank" className="bg-[#1c1c1f]">Blank look</option>
            {Array.from(new Set(templates.map((t) => t.family))).map((f) => (
              <optgroup key={f} label={f}>{templates.filter((t) => t.family === f).map((t) => <option key={t.id} value={t.id} className="bg-[#1c1c1f]">{t.name}</option>)}</optgroup>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {draft.layers.map((l, i) => {
            const def = LAYER_DEFS[l.kind]; const help = LAYER_HELP[l.kind]; const on = l.enabled !== false; const isOpen = open === i;
            return (
              <motion.div key={i} layout transition={smooth} className="overflow-hidden rounded-[18px] bg-white/[0.05]" style={isOpen ? { boxShadow: "inset 0 0 0 1.5px var(--accent)" } : undefined}>
                <div className="flex items-center gap-3 px-3.5 py-3">
                  <button role="switch" aria-checked={on} aria-label={`${on ? "Turn off" : "Turn on"} ${help.title}`} onClick={() => { tap(); patch(i, { enabled: !on }); }}
                    className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-[var(--accent)]" : "bg-white/15"}`}>
                    <motion.span layout transition={snappy} className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow" style={{ left: on ? 22 : 2 }} />
                  </button>
                  <button className="min-w-0 flex-1 text-left" onClick={() => { tap(); setOpen(isOpen ? null : i); }}>
                    <div className={`truncate text-[0.9375rem] font-medium ${on ? "" : "text-white/35"}`}>{help.title}</div>
                    <div className="text-[0.6875rem] text-white/35">{help.cat}</div>
                  </button>
                  <button aria-label={`Move ${help.title} up`} disabled={i === 0} className="flex h-8 w-7 items-center justify-center text-white/50 disabled:opacity-20" onClick={() => move(i, -1)}><I n="chevL" className="h-4 w-4 rotate-90" w={2.2} /></button>
                  <button aria-label={`Move ${help.title} down`} disabled={i === draft.layers.length - 1} className="flex h-8 w-7 items-center justify-center text-white/50 disabled:opacity-20" onClick={() => move(i, 1)}><I n="chevR" className="h-4 w-4 rotate-90" w={2.2} /></button>
                </div>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={smooth} className="overflow-hidden">
                      <div className="space-y-3 border-t border-white/[0.07] px-3.5 pb-3.5 pt-3">
                        <p className="text-[0.8125rem] leading-relaxed text-white/45">{help.help}</p>
                        {def.params.map((p) => {
                          const v = l.params?.[p.key] ?? p.def;
                          return (
                            <div key={p.key}>
                              <div className="flex items-baseline justify-between pb-1">
                                <span className="text-[0.8125rem] text-white/70">{p.label}</span>
                                <span className="text-[0.8125rem] tabular-nums text-white/40">{Number(v.toFixed(2))}</span>
                              </div>
                              <input aria-label={p.label} type="range" min={p.min} max={p.max} step={p.step} value={v} className="w-full accent-[var(--accent)]"
                                onChange={(e) => patch(i, { params: { ...(l.params ?? {}), [p.key]: +e.target.value } }, `p${i}.${p.key}`)} />
                            </div>
                          );
                        })}
                        <div className="flex gap-2 pt-0.5">
                          <button className={ghost} onClick={() => patch(i, { params: defaultParams(l.kind) })}>Reset</button>
                          <button className={ghost} onClick={() => { const a = [...draft.layers]; a.splice(i + 1, 0, JSON.parse(JSON.stringify(l))); set(a); setOpen(i + 1); }}>Duplicate</button>
                          <button className={`${ghost} text-[#ff453a]`} onClick={() => { set(draft.layers.filter((_, k) => k !== i)); setOpen(null); }}>Remove</button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          {draft.layers.length === 0 && <p className="rounded-[18px] bg-white/[0.05] p-6 text-center text-[0.9375rem] leading-relaxed text-white/45">No layers yet. Add one below, or start from a template.</p>}
        </div>

        <div>
          <button className="w-full rounded-xl bg-white/[0.07] py-3 text-[0.9375rem] font-semibold" onClick={() => { tap(); setAdding(!adding); }}>{adding ? "Close the layer list" : "Add a layer"}</button>
          <AnimatePresence initial={false}>
            {adding && (
              <motion.div key="add" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={smooth} className="overflow-hidden">
                <div className="mt-2 space-y-4 rounded-[18px] bg-white/[0.05] p-3.5">
                  {CATS.map((c) => (
                    <div key={c}>
                      <h3 className="pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/35">{c}</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(LAYER_HELP) as GpuLayerKind[]).filter((k) => LAYER_HELP[k].cat === c).map((k) => (
                          <button key={k} onClick={() => { if (draft.layers.length >= 24) return; tap(); set([...draft.layers, { kind: k, params: defaultParams(k) }]); setOpen(draft.layers.length); setAdding(false); }}
                            className="rounded-xl bg-white/[0.06] p-2.5 text-left active:bg-white/[0.12]">
                            <div className="text-[0.8125rem] font-medium">{LAYER_HELP[k].title}</div>
                            <div className="line-clamp-2 text-[0.6875rem] leading-snug text-white/40">{LAYER_HELP[k].help}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {([["Timestamp", stampId, setStamp, [["none", "None"] as const, ...(stampId === "custom" ? [["custom", "Custom"] as const] : []), ...STAMPS.filter((x) => x.overlay).map((x) => [x.id, x.label] as const)]],
             ["Frame", frameId, setFrame, FRAMES.map((f) => [f.id, f.label] as const)]] as [string, string, (v: string) => void, readonly (readonly [string, string])[]][]).map(([label, val, set2, opts]) => (
            <label key={label} className="block">
              <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/35">{label}</span>
              <div className="relative">
                <select className={`${field} appearance-none pr-8`} value={val} onChange={(e) => set2(e.target.value)}>
                  {opts.map(([id, l]) => <option key={id} value={id} className="bg-[#1c1c1f]">{l}</option>)}
                </select>
                <I n="chevR" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-white/40" />
              </div>
            </label>
          ))}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white/35">Description</span>
          <input value={draft.blurb} maxLength={120} onChange={(e) => commit({ ...draft, blurb: e.target.value }, "blurb")} placeholder="What does it feel like?" className={field} />
        </label>

        <div className="flex flex-wrap gap-2">
          <button className={ghost} onClick={onShare}>Share…</button>
          {saved && <button className={ghost} onClick={() => onSave(true)}>Save as a copy</button>}
          {saved && <button className={`${ghost} text-[#ff453a]`} onClick={onDelete}>Delete</button>}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[66px] z-20 mx-auto w-full max-w-md px-4 pb-2">
        <motion.button whileTap={press} transition={snappy} onClick={() => { tap(12); onSave(false); }} className="w-full rounded-2xl bg-white py-3.5 text-[0.9375rem] font-semibold text-black shadow-[0_8px_30px_rgba(0,0,0,.7)]">
          {saved ? "Save changes" : "Save to My Looks"}
        </motion.button>
      </div>

      <AnimatePresence>
        {guide && (
          <motion.div key="guide" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="How looks work"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} onClick={() => setGuide(false)}>
            <motion.div initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0 }} transition={sheetT}
              className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-[26px] bg-[#131316] p-5 safe-b" onClick={(e) => e.stopPropagation()}>
              <h2 className="mb-4 text-[1.375rem] font-bold tracking-[-0.02em]">Make your own look</h2>
              <ol className="space-y-4">
                {GUIDE_STEPS.map((s, i) => (
                  <li key={i} className="flex gap-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[0.8125rem] font-bold text-black">{i + 1}</span>
                    <div><div className="text-[0.9375rem] font-semibold">{s.t}</div><p className="mt-0.5 text-[0.8125rem] leading-relaxed text-white/50">{s.d}</p></div>
                  </li>
                ))}
              </ol>
              <button className="mt-5 w-full rounded-2xl bg-white py-3.5 text-[0.9375rem] font-semibold text-black" onClick={() => setGuide(false)}>Got it</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
