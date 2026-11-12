"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DATA, getLook, LOOKS, looksFor, LIGHTING_GROUPS, type Group } from "@/lib/looks/data";
import type { StylePrefs } from "@/lib/looks/engine";
import { reEditAndUpload } from "@/lib/looks/edit-upload";
import { LIGHTING_LABELS } from "@/lib/projects/paths";
import type { ReviewItem, ReviewLinks } from "@/lib/projects/review";
import { FLAG_LABELS, flagShots } from "@/lib/quality/flags";
import { loadReviewLinks, saveEdit, saveShotChecks, setHidden, setManyHidden, setReviewed } from "./actions";
import { useShotChecks } from "./use-shot-checks";
import { ORIGINAL, usePhotoEditor, type Choice } from "./use-photo-editor";

type Props = {
  projectId: string;
  organizationId: string;
  projectName: string;
  initialItems: ReviewItem[];
  style: StylePrefs;
};

type Filter = "all" | "todo" | "misses";

/** Saves waiting to run: photo id -> what to save (the latest pick wins). */
type Job = { choice: Choice; group: Group };

const LINK_WINDOW = 24;

export function ReviewScreen({ projectId, organizationId, projectName, initialItems, style }: Readonly<Props>) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [currentId, setCurrentId] = useState<string | null>(() => initialItems.find((i) => !i.reviewed)?.id ?? initialItems[0]?.id ?? null);
  const [links, setLinks] = useState<Record<string, ReviewLinks>>({});
  const [picks, setPicks] = useState<Record<string, Choice>>({});
  const [showAll, setShowAll] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [saving, setSaving] = useState({ pending: 0, failed: 0, message: null as string | null });
  const requested = useRef(new Set<string>());
  const queue = useRef(new Map<string, Job>());
  const running = useRef(false);
  const groups = useRef(new Map<string, Group>());

  const flagged = useMemo(() => flagShots(items.map((i) => ({ id: i.id, check: i.check }))), [items]);
  const misses = useMemo(() => items.filter((i) => flagged.get(i.id)?.flags.length && !i.hidden), [items, flagged]);
  const list = useMemo(() => {
    if (filter === "todo") return items.filter((i) => !i.reviewed || i.id === currentId);
    if (filter === "misses") return items.filter((i) => (flagged.get(i.id)?.flags.length && !i.hidden) || i.id === currentId);
    return items;
  }, [items, filter, currentId, flagged]);
  const [confirmHideMisses, setConfirmHideMisses] = useState(false);
  const scan = useShotChecks(projectId, items, (checks) => {
    setItems((all) => all.map((i) => (checks[i.id] ? { ...i, check: checks[i.id] } : i)));
    void saveShotChecks(projectId, Object.entries(checks).map(([photoId, check]) => ({ photoId, check })));
  });
  const index = Math.max(0, list.findIndex((i) => i.id === currentId));
  const item = list[index] ?? null;
  const reviewedCount = items.filter((i) => i.reviewed).length;

  // Signed links for the photos around the current one.
  useEffect(() => {
    const around = list.slice(Math.max(0, index - 6), index + LINK_WINDOW).map((i) => i.id);
    const missing = around.filter((id) => !links[id] && !requested.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => requested.current.add(id));
    loadReviewLinks(projectId, missing)
      .then((got) => setLinks((l) => ({ ...l, ...Object.fromEntries(got.map((g) => [g.id, g])) })))
      .catch(() => missing.forEach((id) => requested.current.delete(id)));
  }, [list, index, links, projectId]);

  const choice: Choice | null = item ? (picks[item.id] ?? item.look ?? ORIGINAL) : null;
  const editor = usePhotoEditor(item, item ? (links[item.id] ?? null) : null, style, comparing ? ORIGINAL : choice, showAll);
  const group = editor.group;
  useEffect(() => {
    if (item && group) groups.current.set(item.id, group);
  }, [item, group]);

  // --- Saving ----------------------------------------------------------------

  const refreshLinks = useCallback((ids: string[]) => {
    ids.forEach((id) => requested.current.delete(id));
    setLinks((l) => {
      const next = { ...l };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  }, []);

  const runQueue = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = queue.current.entries().next();
        if (next.done) break;
        const [photoId, job] = next.value;
        queue.current.delete(photoId);
        setSaving((s) => ({ ...s, pending: queue.current.size + 1 }));
        try {
          let error: string | null;
          if (job.choice === ORIGINAL) {
            error = (await saveEdit(projectId, photoId, null)).error;
          } else {
            const [link] = await loadReviewLinks(projectId, [photoId]);
            if (!link) throw new Error("Photo not found.");
            const version = await reEditAndUpload({ organizationId, projectId, photoId }, link.plainFull, job.group, job.choice);
            error = (await saveEdit(projectId, photoId, { version, lighting: job.group, look: job.choice })).error;
          }
          if (error) throw new Error(error);
          setItems((all) => all.map((i) => (i.id === photoId ? { ...i, look: job.choice === ORIGINAL ? null : job.choice, lighting: job.choice === ORIGINAL ? i.lighting : job.group, reviewed: true } : i)));
          setPicks((p) => {
            if (p[photoId] !== job.choice) return p;
            const rest = { ...p };
            delete rest[photoId];
            return rest;
          });
          refreshLinks([photoId]);
        } catch (e) {
          setSaving((s) => ({ ...s, failed: s.failed + 1, message: (e as Error).message }));
        }
      }
    } finally {
      running.current = false;
      setSaving((s) => ({ ...s, pending: 0 }));
    }
  }, [organizationId, projectId, refreshLinks]);

  const pick = useCallback(
    (photo: ReviewItem, next: Choice) => {
      // The plain photo needs no light; a look does (known once the photo is measured).
      const g = groups.current.get(photo.id) ?? photo.lighting ?? (next === ORIGINAL ? "daylight" : null);
      if (!g) return;
      setPicks((p) => ({ ...p, [photo.id]: next }));
      setConfirmAll(false);
      const saved = photo.look ?? ORIGINAL;
      if (next === saved && !queue.current.has(photo.id)) return;
      queue.current.set(photo.id, { choice: next, group: g });
      setSaving((s) => ({ ...s, pending: queue.current.size, message: null }));
      void runQueue();
    },
    [runQueue],
  );

  // Don't lose unsaved edits by leaving.
  useEffect(() => {
    if (!saving.pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving.pending]);

  // --- Moving and approving ----------------------------------------------------

  const go = useCallback(
    (step: number) => {
      const next = list[index + step];
      if (next) setCurrentId(next.id);
    },
    [list, index],
  );

  const approve = useCallback(async () => {
    if (!item) return;
    const nowReviewed = !item.reviewed;
    setItems((all) => all.map((i) => (i.id === item.id ? { ...i, reviewed: nowReviewed } : i)));
    if (nowReviewed) go(1);
    const { error } = await setReviewed(projectId, [item.id], nowReviewed);
    if (error) {
      setItems((all) => all.map((i) => (i.id === item.id ? { ...i, reviewed: !nowReviewed } : i)));
      setSaving((s) => ({ ...s, message: error }));
    }
  }, [item, go, projectId]);

  const toggleHidden = useCallback(async () => {
    if (!item) return;
    const hidden = !item.hidden;
    setItems((all) => all.map((i) => (i.id === item.id ? { ...i, hidden } : i)));
    const { error } = await setHidden(projectId, item.id, hidden);
    if (error) {
      setItems((all) => all.map((i) => (i.id === item.id ? { ...i, hidden: !hidden } : i)));
      setSaving((s) => ({ ...s, message: error }));
    }
  }, [item, projectId]);

  const sameLight = useMemo(() => (group ? items.filter((i) => i.lighting === group) : []), [items, group]);

  const applyToAll = useCallback(() => {
    if (!item || !group || !choice) return;
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    setConfirmAll(false);
    for (const photo of sameLight) {
      const saved = photo.look ?? ORIGINAL;
      if (photo.id !== item.id && saved === choice && !queue.current.has(photo.id)) continue;
      setPicks((p) => ({ ...p, [photo.id]: choice }));
      if (saved !== choice || queue.current.has(photo.id)) queue.current.set(photo.id, { choice, group });
    }
    setSaving((s) => ({ ...s, pending: queue.current.size, message: null }));
    void runQueue();
  }, [item, group, choice, confirmAll, sameLight, runQueue]);

  // --- Keyboard -------------------------------------------------------------------

  const groupLooks = useMemo(() => (group ? looksFor(group) : []), [group]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Enter") void approve();
      else if (e.key.toLowerCase() === "h") void toggleHidden();
      else if (e.key === "0" && item) pick(item, ORIGINAL);
      else if (/^[1-5]$/.test(e.key) && item && groupLooks[Number(e.key) - 1]) pick(item, groupLooks[Number(e.key) - 1].id);
      else if (e.key === " ") {
        e.preventDefault();
        setComparing(true);
        return;
      } else return;
      e.preventDefault();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === " ") setComparing(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [go, approve, toggleHidden, pick, item, groupLooks]);

  if (!item) {
    return (
      <Shell projectId={projectId} projectName={projectName}>
        <div className="grid flex-1 place-items-center p-8 text-center text-neutral-300">
          <div>
            <p className="font-display text-3xl italic text-white">No photos yet</p>
            <p className="mt-2 text-sm">Upload a folder first, then come back to review the looks.</p>
          </div>
        </div>
      </Shell>
    );
  }

  const look = choice && choice !== ORIGINAL ? getLook(choice) : null;
  const otherGroups = LIGHTING_GROUPS.filter((g) => g !== group);

  return (
    <Shell projectId={projectId} projectName={projectName}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-4 py-2 text-sm text-neutral-300">
        <span className="tabular-nums" aria-live="polite">
          Photo {index + 1} of {list.length}
        </span>
        <span className="tabular-nums text-neutral-400">
          {reviewedCount} of {items.length} approved
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-full bg-white/5 p-1" role="tablist" aria-label="Which photos">
          {(["all", "todo", "misses"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? "bg-white text-neutral-950" : "text-neutral-300 hover:text-white"}`}
            >
              {f === "all" ? "All photos" : f === "todo" ? "To approve" : `Possible misses (${misses.length})`}
            </button>
          ))}
        </div>
        {scan.total ? (
          <span className="text-xs text-neutral-400" aria-live="polite">
            Checking for misses {scan.done} of {scan.total}…
          </span>
        ) : null}
        <SaveStatus pending={saving.pending} failed={saving.failed} message={saving.message} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* The photo */}
        <div className="relative flex min-h-[50vh] flex-1 items-center justify-center bg-black p-2 lg:min-h-0">
          {editor.shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed / local links, sized by the browser
            <img
              key={editor.shown}
              src={editor.shown}
              alt={item.fileName}
              className={`max-h-full max-w-full object-contain transition-opacity ${editor.rendering ? "opacity-90" : "opacity-100"}`}
              style={{ aspectRatio: `${item.width} / ${item.height}`, backgroundColor: item.tone ?? "#111" }}
            />
          ) : (
            <div className="aspect-[3/2] w-full max-w-3xl animate-pulse rounded" style={{ backgroundColor: item.tone ?? "#1a1a1a" }} />
          )}
          {editor.error ? <p className="absolute inset-x-0 top-4 text-center text-sm text-red-300">{editor.error}</p> : null}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2 text-xs">
            {group ? <span className="rounded-full bg-black/60 px-2.5 py-1 text-white">{LIGHTING_LABELS[group]}</span> : null}
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-white">{comparing ? "Original" : look ? look.name : "Original"}</span>
            {item.hidden ? <span className="rounded-full bg-amber-400 px-2.5 py-1 font-semibold text-neutral-950">Hidden from guests</span> : null}
            {item.reviewed ? <span className="rounded-full bg-emerald-400 px-2.5 py-1 font-semibold text-neutral-950">Approved</span> : null}
            {(flagged.get(item.id)?.flags ?? []).map((f) => (
              <span key={f} className="rounded-full bg-rose-500 px-2.5 py-1 font-semibold text-white">
                {f === "eyes_closed" && item.check && item.check.faces > 1 ? `Eyes closed (${item.check.eyesClosed} of ${item.check.faces})` : FLAG_LABELS[f]}
              </span>
            ))}
            {editor.rendering ? <span className="rounded-full bg-black/60 px-2.5 py-1 text-neutral-300">Rendering…</span> : null}
          </div>
          <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/80 disabled:opacity-30">
            ‹
          </button>
          <button type="button" onClick={() => go(1)} disabled={index >= list.length - 1} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/80 disabled:opacity-30">
            ›
          </button>
          <button
            type="button"
            onPointerDown={() => setComparing(true)}
            onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 select-none rounded-full bg-black/60 px-4 py-2 text-xs font-semibold text-white"
          >
            Hold to see the original <kbd className="ml-1 hidden rounded bg-white/15 px-1 sm:inline">Space</kbd>
          </button>
        </div>

        {/* Looks and actions */}
        <aside className="flex w-full flex-col gap-4 overflow-y-auto border-white/10 bg-neutral-900 p-4 text-neutral-200 lg:w-[380px] lg:border-l">
          {filter === "misses" ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm">
              <p className="text-rose-100">
                {misses.length
                  ? `${misses.length} photo${misses.length === 1 ? "" : "s"} look like misses: soft focus, closed eyes, bad exposure, or a weaker copy of the shot next to it. Check them, then hide the ones guests shouldn't see.`
                  : scan.total
                    ? "Still checking photos…"
                    : "No misses found."}
              </p>
              {flagged.get(item.id)?.similarTo ? (
                <button type="button" onClick={() => setCurrentId(flagged.get(item.id)!.similarTo)} className="mt-2 text-xs font-semibold text-white underline underline-offset-4">
                  See the better shot
                </button>
              ) : null}
              {misses.length ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmHideMisses) {
                      setConfirmHideMisses(true);
                      return;
                    }
                    setConfirmHideMisses(false);
                    const ids = new Set(misses.map((m) => m.id));
                    setItems((all) => all.map((i) => (ids.has(i.id) ? { ...i, hidden: true } : i)));
                    void setManyHidden(projectId, [...ids], true).then(({ error }) => {
                      if (error) setSaving((st) => ({ ...st, message: error }));
                    });
                  }}
                  className={`mt-3 block w-full rounded-full px-4 py-2 text-sm font-semibold ${confirmHideMisses ? "bg-rose-400 text-neutral-950" : "bg-white/10 text-white hover:bg-white/20"}`}
                >
                  {confirmHideMisses ? `Tap again to hide ${misses.length} from guests` : `Hide all ${misses.length} from guests`}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void approve()} className={`rounded-full px-4 py-2.5 text-sm font-semibold ${item.reviewed ? "bg-emerald-400 text-neutral-950" : "bg-white text-neutral-950 hover:opacity-90"}`}>
              {item.reviewed ? "✓ Approved" : "Approve"} <kbd className="ml-1 hidden text-xs opacity-60 sm:inline">Enter</kbd>
            </button>
            <button type="button" onClick={() => void toggleHidden()} className="rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold hover:border-white">
              {item.hidden ? "Show to guests" : "Hide from guests"} <kbd className="ml-1 hidden text-xs opacity-60 sm:inline">H</kbd>
            </button>
          </div>

          <section aria-label="Looks">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-white">{group ? `${LIGHTING_LABELS[group]} looks` : "Looks"}</h2>
              {style[group ?? "daylight"] && group ? <span className="text-xs text-neutral-400">Your usual: {getLook(style[group]!).name}</span> : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Swatch label="Original" hint="0" src={links[item.id]?.plainThumb ?? null} active={choice === ORIGINAL} onClick={() => pick(item, ORIGINAL)} />
              {(group ? looksFor(group) : []).map((l, i) => (
                <Swatch
                  key={l.id}
                  label={l.name}
                  hint={String(i + 1)}
                  src={editor.swatches[l.id] ?? null}
                  active={choice === l.id}
                  badge={editor.suggested === l.id ? "Suggested" : undefined}
                  onClick={() => pick(item, l.id)}
                />
              ))}
            </div>
            {look ? <p className="mt-3 text-xs leading-relaxed text-neutral-400">{look.description}</p> : null}
          </section>

          {group && choice ? (
            <button type="button" onClick={applyToAll} className={`rounded-xl border px-4 py-3 text-left text-sm ${confirmAll ? "border-amber-300 bg-amber-300/10 text-amber-100" : "border-white/15 hover:border-white/40"}`}>
              {confirmAll
                ? `Tap again to use ${look ? look.name : "the original"} on all ${sameLight.length} ${LIGHTING_LABELS[group].toLowerCase()} photos`
                : `Use ${look ? look.name : "the original"} on every ${LIGHTING_LABELS[group].toLowerCase()} photo (${sameLight.length})`}
            </button>
          ) : null}

          <section aria-label="More looks">
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold text-neutral-300 underline-offset-4 hover:underline" aria-expanded={showAll}>
              {showAll ? "Hide other looks" : `Try looks for other light (${LOOKS.length - (group ? 5 : 0)})`}
            </button>
            {showAll
              ? otherGroups.map((g) => (
                  <div key={g} className="mt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{LIGHTING_LABELS[g]}</h3>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {looksFor(g).map((l) => (
                        <Swatch key={l.id} label={l.name} src={editor.swatches[l.id] ?? null} active={choice === l.id} onClick={() => pick(item, l.id)} />
                      ))}
                    </div>
                  </div>
                ))
              : null}
          </section>

          <p className="mt-auto text-xs leading-relaxed text-neutral-500">
            Keys: ← → move · 1–5 looks · 0 original · Enter approve · H hide · hold Space to compare. Looks you pick are learnt: new photos in the same
            light start with your favourite. Defaults: {LIGHTING_GROUPS.map((g) => `${LIGHTING_LABELS[g]} ${getLook(style[g] ?? DATA.defaultLook[g]).name}`).join(", ")}.
          </p>
        </aside>
      </div>

      <Filmstrip list={list} index={index} links={links} picks={picks} onPick={setCurrentId} />
    </Shell>
  );
}

function Shell({ projectId, projectName, children }: Readonly<{ projectId: string; projectName: string; children: React.ReactNode }>) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <Link href={`/dashboard/projects/${projectId}`} className="rounded-full border border-white/20 px-3 py-1.5 text-sm hover:border-white">
          ← Back
        </Link>
        <h1 className="truncate font-display text-xl italic">Review · {projectName}</h1>
      </header>
      {children}
    </div>
  );
}

function SaveStatus({ pending, failed, message }: Readonly<{ pending: number; failed: number; message: string | null }>) {
  if (pending) return <span className="text-xs text-sky-300">Saving {pending}…</span>;
  if (message) return <span role="alert" className="text-xs text-red-300">{failed ? `${failed} not saved: ` : ""}{message}</span>;
  return <span className="text-xs text-neutral-500">All changes saved</span>;
}

function Swatch({ label, hint, src, active, badge, onClick }: Readonly<{ label: string; hint?: string; src: string | null; active: boolean; badge?: string; onClick: () => void }>) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`group relative overflow-hidden rounded-lg text-left ring-2 transition ${active ? "ring-white" : "ring-transparent hover:ring-white/40"}`}>
      <span className="block aspect-[4/3] bg-neutral-800">
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered in the browser */}
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse bg-neutral-800" />}
      </span>
      <span className="block truncate px-1.5 py-1 text-[11px] font-medium text-neutral-200">
        {hint ? <span className="mr-1 text-neutral-500">{hint}</span> : null}
        {label}
      </span>
      {badge ? <span className="absolute right-1 top-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-neutral-950">{badge}</span> : null}
    </button>
  );
}

function Filmstrip({ list, index, links, picks, onPick }: Readonly<{ list: ReviewItem[]; index: number; links: Record<string, ReviewLinks>; picks: Record<string, Choice>; onPick: (id: string) => void }>) {
  const from = Math.max(0, index - 12);
  const shown = list.slice(from, index + 24);
  const current = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);
  return (
    <nav aria-label="Photos" className="flex gap-1.5 overflow-x-auto border-t border-white/10 bg-neutral-950 px-3 py-2">
      {shown.map((p, i) => {
        const link = links[p.id];
        const src = link ? (link.editedThumb ?? link.plainThumb) : null;
        const isCurrent = from + i === index;
        return (
          <button
            key={p.id}
            ref={isCurrent ? current : undefined}
            type="button"
            onClick={() => onPick(p.id)}
            aria-current={isCurrent ? "true" : undefined}
            aria-label={`Photo ${from + i + 1}${p.reviewed ? ", approved" : ""}`}
            className={`relative h-14 shrink-0 overflow-hidden rounded ring-2 ${isCurrent ? "ring-white" : "ring-transparent opacity-70 hover:opacity-100"}`}
            style={{ aspectRatio: `${p.width} / ${p.height}`, backgroundColor: p.tone ?? "#222" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed links */}
            {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
            {p.reviewed ? <span className="absolute bottom-0.5 right-0.5 rounded-full bg-emerald-400 px-1 text-[9px] font-bold text-neutral-950">✓</span> : null}
            {picks[p.id] && picks[p.id] !== (p.look ?? ORIGINAL) ? <span className="absolute left-0.5 top-0.5 h-2 w-2 rounded-full bg-sky-400" title="Saving" /> : null}
            {p.hidden ? <span className="absolute inset-0 bg-black/60" /> : null}
          </button>
        );
      })}
    </nav>
  );
}
