"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { I } from "./icons";
import { useObjectUrl, useObjectUrls } from "./useObjectUrl";
import { fade, morph, press, snappy, tap } from "./motion";

export interface RollShot {
  id: string; url: string; kind: "photo" | "video"; ext: string; blob: Blob; created: number; exported?: boolean;
  camera?: string; look?: string; film?: string; geo?: { lat: number; lon: number }; liked?: boolean;
}

/** "15.4909° N, 73.8278° E" — a rough fix, never a place name or a map, so nothing has to leave the phone to show it. */
function coordLabel(geo: { lat: number; lon: number }) {
  const part = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
  return `${part(geo.lat, "N", "S")}, ${part(geo.lon, "E", "W")}`;
}

const dayOf = (t: number) => {
  const d = new Date(t), now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, now)) return "Today";
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
};

export interface BinnedShot { id: string; kind: "photo" | "video"; blob: Blob; thumb?: Blob; created: number; binned: number }

export function Roll({ shots, trash, onShare, onSave, onDelete, onCamera, onImport, onMakeStrip, onRestore, onDrop, onEmptyBin, onClip, onLike }: {
  shots: RollShot[]; trash: BinnedShot[];
  onShare: (s: RollShot) => void; onSave: (s: RollShot) => void; onDelete: (s: RollShot) => void;
  onCamera: () => void; onImport: (files: FileList | null) => void; onMakeStrip: (ids: string[]) => void;
  onRestore: (id: string) => void; onDrop: (id: string) => void; onEmptyBin: () => void;
  /** Makes a short clip of the photo developing. Absent where the browser cannot record video. */
  onClip?: (s: RollShot) => void;
  /** Hearts or un-hearts a shot. Local only — nothing about a like leaves the phone. */
  onLike: (s: RollShot) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [bin, setBin] = useState(false);
  // Keyed to the shot it belongs to, so switching photos starts with the panel closed without an effect.
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Previews for the bin exist only while it is open and are revoked when it closes.
  const binUrls = useObjectUrls(bin ? trash : null, (t) => t.thumb ?? t.blob);
  const toggle = (id: string) => { tap(); setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); };
  const stopPicking = () => { setPicking(false); setChosen([]); };
  const cur = shots.find((s) => s.id === open);

  // The grid holds small previews; the viewer loads the real photo only while it is open.
  const full = useObjectUrl(cur?.blob, cur?.id);
  const idx = cur ? shots.indexOf(cur) : -1;
  const info = !!cur && infoFor === cur.id;
  const toggleInfo = () => { tap(); setInfoFor((v) => (cur && v !== cur.id ? cur.id : null)); };

  const likeNow = (s: RollShot) => { tap(); onLike(s); };
  const onImageTap = (s: RollShot) => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      if (!s.liked) likeNow(s);
      setBurst(now);
      window.setTimeout(() => setBurst((b) => (b === now ? 0 : b)), 650);
    }
    lastTap.current = now;
  };

  const groups: { day: string; items: RollShot[] }[] = [];
  for (const s of shots) {
    const day = dayOf(s.created);
    if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] });
    groups[groups.length - 1].items.push(s);
  }

  if (shots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
        <h2 className="t-title2">Your roll is empty</h2>
        <p className="t-body max-w-[17rem] text-white/50">Everything you shoot lands here and stays on this phone.</p>
        <motion.button whileTap={press} transition={snappy} onClick={() => { tap(); onCamera(); }} className="t-headline mt-2 rounded-full bg-white px-7 py-3.5 text-black">Take a photo</motion.button>
        <button onClick={() => fileRef.current?.click()} className="t-subhead mt-1 py-2 text-white/45 underline-offset-4 active:underline">or add from your phone</button>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { onImport(e.target.files); e.target.value = ""; }} />
      </div>
    );
  }

  return (
    <>
      <header className="safe-t flex items-end justify-between px-4 pb-3 pt-3">
        <div>
          <h1 className="text-[1.75rem] font-bold tracking-[-0.02em]">Roll</h1>
          <p className="text-[0.8125rem] text-white/40">{picking ? `${chosen.length} selected` : `${shots.length} ${shots.length === 1 ? "shot" : "shots"}`}</p>
        </div>
        <div className="flex items-center gap-2 pb-1">
          {!picking && (
            <button onClick={() => { tap(); fileRef.current?.click(); }} aria-label="Add photos or videos from your phone"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.09]"><I n="plus" className="h-[18px] w-[18px]" /></button>
          )}
          <button onClick={() => { tap(); if (picking) stopPicking(); else setPicking(true); }} className="text-[0.9375rem] font-medium text-[var(--accent)]">{picking ? "Cancel" : "Select"}</button>
        </div>
      </header>
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { onImport(e.target.files); e.target.value = ""; }} />

      {groups.map((g) => (
        <section key={g.day} className="pb-5">
          <h2 className="px-4 pb-1.5 text-[0.8125rem] font-semibold text-white/50">{g.day}</h2>
          <div className="grid grid-cols-3 gap-[3px]">
            {g.items.map((s, i) => (
              <motion.button key={s.id} layoutId={`shot-${s.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ opacity: { delay: Math.min(i, 9) * 0.02, duration: 0.25 }, layout: morph }}
                onClick={() => (picking ? toggle(s.id) : (tap(), setOpen(s.id)))} aria-label={picking ? `Select ${s.kind}` : `Open ${s.kind} from ${g.day}`} aria-pressed={picking ? chosen.includes(s.id) : undefined}
                className="relative aspect-square overflow-hidden bg-white/[0.04]">
                {s.kind === "photo"
                  ? <img src={s.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : <video src={s.url} muted playsInline className="h-full w-full object-cover" />}
                {s.kind === "video" && <span className="absolute bottom-1 right-1.5 text-[0.6875rem] font-semibold drop-shadow">VIDEO</span>}
                {s.liked && !picking && <I n="heart" filled className="absolute bottom-1 left-1.5 h-3.5 w-3.5 text-[#ff453a] drop-shadow" />}
                {picking && (
                  <span className={`absolute inset-0 transition-colors ${chosen.includes(s.id) ? "bg-black/35" : ""}`}>
                    <span className={`absolute bottom-1.5 right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] ${chosen.includes(s.id) ? "border-[var(--accent)] bg-[var(--accent)] text-black" : "border-white/80 bg-black/25"}`}>
                      {chosen.includes(s.id) && <I n="check" className="h-3.5 w-3.5" w={3} />}
                    </span>
                  </span>
                )}
              </motion.button>
            ))}
          </div>
        </section>
      ))}

      {trash.length > 0 && !picking && (
        <section className="px-4 pb-24 pt-1">
          <button onClick={() => { tap(); setBin((b) => !b); }} aria-expanded={bin} className="flex w-full items-center justify-between rounded-xl bg-white/[0.05] px-4 py-3 text-left">
            <span>
              <span className="block text-[0.9375rem] font-medium">Recently deleted</span>
              <span className="block text-[0.75rem] text-white/40">{trash.length} {trash.length === 1 ? "shot" : "shots"} · kept for 30 days</span>
            </span>
            <I n="chevR" className={`h-[18px] w-[18px] text-white/35 transition-transform ${bin ? "rotate-90" : ""}`} />
          </button>
          <AnimatePresence initial={false}>
            {bin && (
              <motion.div key="bin" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={fade} className="overflow-hidden">
                <div className="grid grid-cols-3 gap-[3px] pt-[3px]">
                  {trash.map((t) => (
                    <div key={t.id} className="relative aspect-square overflow-hidden bg-white/[0.04]">
                      <img src={binUrls[t.id]} alt="" className="h-full w-full object-cover opacity-55" />
                      <div className="absolute inset-x-0 bottom-0 flex">
                        <button onClick={() => { tap(); onRestore(t.id); }} className="flex-1 bg-black/70 py-1.5 text-[0.6875rem] font-semibold">Put back</button>
                        <button onClick={() => { tap(); onDrop(t.id); }} aria-label="Delete for good" className="bg-black/70 px-2 py-1.5 text-[0.6875rem] font-semibold text-[#ff453a]">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { tap(); onEmptyBin(); setBin(false); }} className="mt-2 w-full rounded-xl bg-white/[0.05] py-2.5 text-[0.8125rem] font-medium text-[#ff453a]">Empty the bin</button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <AnimatePresence>
        {picking && chosen.length > 0 && (
          <motion.div key="bar" initial={{ y: 70 }} animate={{ y: 0 }} exit={{ y: 70 }} transition={snappy}
            className="fixed inset-x-0 bottom-[66px] z-30 mx-auto flex w-full max-w-md gap-2 px-4 pb-2">
            <button onClick={() => { onMakeStrip(chosen); stopPicking(); }} className="flex-1 rounded-2xl bg-white py-3.5 text-[0.9375rem] font-semibold text-black shadow-[0_8px_30px_rgba(0,0,0,.7)]">
              Build with {chosen.length}
            </button>
            <button aria-label="Delete selected" onClick={() => { chosen.forEach((id) => { const s2 = shots.find((x) => x.id === id); if (s2) onDelete(s2); }); stopPicking(); }}
              className="flex h-[50px] w-[50px] items-center justify-center rounded-2xl bg-white/[0.12] text-[#ff453a] backdrop-blur"><I n="trash" className="h-[19px] w-[19px]" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cur && (
          <motion.div key="viewer" className="fixed inset-0 z-[60] flex flex-col bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
            <div className="safe-t flex items-center justify-between px-3 pt-2">
              <motion.button whileTap={press} transition={snappy} aria-label="Close" onClick={() => setOpen(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.09]"><I n="close" className="h-[19px] w-[19px]" /></motion.button>
              <span className="text-[0.8125rem] tabular-nums text-white/45">{idx + 1} of {shots.length}</span>
              <motion.button whileTap={press} transition={snappy} onClick={() => likeNow(cur)} aria-label={cur.liked ? "Unlike" : "Like"} aria-pressed={!!cur.liked}
                className={`flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.09] ${cur.liked ? "text-[#ff453a]" : ""}`}>
                <I n="heart" filled={!!cur.liked} className="h-[19px] w-[19px]" />
              </motion.button>
            </div>

            {/* Drag this handle down (or tap it) to see what made the shot: look, film, camera, roughly where. */}
            <motion.div drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.5} dragMomentum={false}
              onDragEnd={(_, i) => { if (Math.abs(i.offset.y) > 18) toggleInfo(); }}
              onClick={toggleInfo} aria-expanded={info} aria-label="Shot details"
              className="flex cursor-grab touch-none justify-center py-1.5 active:cursor-grabbing">
              <span className="flex items-center gap-1 rounded-full bg-white/[0.09] px-3 py-1">
                <I n="chevD" className={`h-3 w-3 text-white/50 transition-transform ${info ? "rotate-180" : ""}`} w={2.4} />
                <span className="text-[0.6875rem] font-medium text-white/50">Details</span>
              </span>
            </motion.div>

            <AnimatePresence initial={false}>
              {info && (
                <motion.div key="info" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={fade} className="overflow-hidden px-4">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-2xl bg-white/[0.06] p-3.5 pb-3">
                    <InfoRow icon="looks" label="Look" value={cur.look ?? "Default"} />
                    <InfoRow icon="film" label="Film" value={cur.film ?? "None"} />
                    <InfoRow icon="camera" label="Camera" value={cur.camera ?? "—"} />
                    <InfoRow icon="pin" label="Taken near" value={cur.geo ? coordLabel(cur.geo) : "Off"} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* The tile grows into this and shrinks back on close; swipe sideways for the next shot, down to close, double-tap to like. */}
            <motion.div layoutId={`shot-${cur.id}`} transition={morph} className="relative min-h-0 flex-1" drag dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} dragElastic={0.45}
              onClick={() => onImageTap(cur)}
              onDragEnd={(_, i) => {
                if (i.offset.y > 110 && Math.abs(i.offset.y) > Math.abs(i.offset.x)) { tap(); setOpen(null); }
                else if (i.offset.x < -70 && shots[idx + 1]) { tap(); setOpen(shots[idx + 1].id); }
                else if (i.offset.x > 70 && shots[idx - 1]) { tap(); setOpen(shots[idx - 1].id); }
              }}>
              {cur.kind === "photo"
                ? <img src={full ?? cur.url} alt="" className="h-full w-full object-contain" />
                : full && <video src={full} controls autoPlay loop playsInline className="h-full w-full object-contain" />}
              <AnimatePresence>
                {burst !== 0 && (
                  <motion.div key={burst} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: [0.5, 1.15, 1], opacity: [0, 1, 1] }} exit={{ opacity: 0, scale: 1.25 }}
                    transition={{ duration: 0.55, times: [0, 0.55, 1] }} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <I n="heart" filled className="h-24 w-24 text-white drop-shadow-[0_4px_24px_rgba(0,0,0,.55)]" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <div className="flex items-center justify-center gap-2.5 px-4 pb-5 pt-4 safe-b">
              <motion.button whileTap={press} transition={snappy} onClick={() => onSave(cur)} aria-label={cur.exported ? "Saved to your phone. Save again" : "Save to your phone"} className="flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-white px-3 py-3.5 text-[0.9375rem] font-semibold text-black">
                <I n={cur.exported ? "check" : "save"} className="h-[18px] w-[18px] shrink-0" /> <span className="truncate">{cur.exported ? "Saved" : "Save"}</span>
              </motion.button>
              {onClip && cur.kind === "photo" && (
                <motion.button whileTap={press} transition={snappy} aria-label="Make a develop clip" title="Develop clip" onClick={() => onClip(cur)} className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white/[0.09]"><I n="film" className="h-[19px] w-[19px]" /></motion.button>
              )}
              <motion.button whileTap={press} transition={snappy} aria-label="Share" onClick={() => onShare(cur)} className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white/[0.09]"><I n="share" className="h-[19px] w-[19px]" /></motion.button>
              <motion.button whileTap={press} transition={snappy} aria-label="Delete" onClick={() => { const next = shots[idx + 1] ?? shots[idx - 1]; onDelete(cur); setOpen(next?.id ?? null); }}
                className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white/[0.09] text-[#ff453a]"><I n="trash" className="h-[19px] w-[19px]" /></motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function InfoRow({ icon, label, value }: { icon: "looks" | "film" | "camera" | "pin"; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08]"><I n={icon} className="h-[15px] w-[15px] text-white/55" /></span>
      <span className="min-w-0">
        <span className="block text-[0.6875rem] text-white/40">{label}</span>
        <span className="block truncate text-[0.8125rem] font-medium">{value}</span>
      </span>
    </div>
  );
}
