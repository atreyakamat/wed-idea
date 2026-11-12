"use client";

import { Zip, ZipPassThrough } from "fflate";
import { useEffect, useRef, useState } from "react";
import { saveBlob } from "@/lib/gallery/export-polaroid";
import type { PublicPhoto } from "@/lib/projects/gallery";
import { approxSize, downloadParts, uniqueNames, zipName } from "@/lib/projects/gallery-layout";

type Props = {
  projectName: string;
  load: () => Promise<PublicPhoto[] | null>;
  favourites: PublicPhoto[];
  total: number;
  onClose: () => void;
};

type Writer = { write: (chunk: Uint8Array) => Promise<void>; close: () => Promise<void> };
type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<Writer> }>;

const FETCH_AT_ONCE = 4;

/** Zips photos (stored, not re-compressed: JPEGs don't shrink) and streams the bytes to `sink`. */
async function zipPhotos(photos: PublicPhoto[], sink: (chunk: Uint8Array) => Promise<void>, onProgress: (done: number) => void, signal: AbortSignal) {
  const names = uniqueNames(photos.map((p) => p.downloadName));
  let pending: Promise<void> = Promise.resolve();
  let failed: unknown = null;
  const zip = new Zip((err, chunk) => {
    if (err) failed = err;
    else pending = pending.then(() => sink(chunk));
  });
  // Fetch a few ahead, add to the zip in order.
  const fetches: Promise<Uint8Array>[] = [];
  const start = (i: number) => {
    fetches[i] = fetch(photos[i].fullUrl, { signal }).then(async (r) => {
      if (!r.ok) throw new Error("A photo link has timed out. Reload the page and try again.");
      return new Uint8Array(await r.arrayBuffer());
    });
  };
  for (let i = 0; i < Math.min(FETCH_AT_ONCE, photos.length); i++) start(i);
  for (let i = 0; i < photos.length; i++) {
    const data = await fetches[i];
    if (i + FETCH_AT_ONCE < photos.length) start(i + FETCH_AT_ONCE);
    const entry = new ZipPassThrough(names[i]);
    zip.add(entry);
    entry.push(data, true);
    await pending;
    if (failed) throw failed;
    onProgress(i + 1);
  }
  zip.end();
  await pending;
  if (failed) throw failed;
}

export function DownloadSheet({ projectName, load, favourites, total, onClose }: Readonly<Props>) {
  const [which, setWhich] = useState<"all" | "favourites">("all");
  const [photos, setPhotos] = useState<PublicPhoto[] | null>(null);
  const [busy, setBusy] = useState<{ part: number; done: number; of: number } | null>(null);
  const [finished, setFinished] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const phone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const picker = typeof window !== "undefined" ? (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker : undefined;
  const perPart = phone ? 40 : 150;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => () => abort.current?.abort(), []);

  const chosen = which === "favourites" ? favourites : photos;
  const count = which === "favourites" ? favourites.length : total;
  const parts = chosen ? downloadParts(chosen, perPart) : [];

  async function listAll(): Promise<PublicPhoto[] | null> {
    if (which === "favourites") return favourites;
    if (photos) return photos;
    const list = await load();
    if (!list) {
      setError("This gallery is no longer available.");
      return null;
    }
    setPhotos(list);
    return list;
  }

  async function run(part: number, toDisk: boolean) {
    setError(null);
    const list = await listAll();
    if (!list?.length) return;
    const groups = toDisk ? [list] : downloadParts(list, perPart);
    const items = groups[part];
    if (!items) return;
    abort.current = new AbortController();
    setBusy({ part, done: 0, of: items.length });
    try {
      const name = zipName(projectName, toDisk ? undefined : { index: part, total: groups.length });
      if (toDisk && picker) {
        const handle = await picker({ suggestedName: name, types: [{ description: "Zip file", accept: { "application/zip": [".zip"] } }] });
        const writer = await handle.createWritable();
        await zipPhotos(items, (c) => writer.write(c), (done) => setBusy({ part, done, of: items.length }), abort.current.signal);
        await writer.close();
      } else {
        const chunks: Uint8Array[] = [];
        await zipPhotos(items, async (c) => void chunks.push(c), (done) => setBusy({ part, done, of: items.length }), abort.current.signal);
        saveBlob(new Blob(chunks as BlobPart[], { type: "application/zip" }), name);
      }
      setFinished((s) => new Set(s).add(toDisk ? -1 : part));
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") setError(err.message || "The download stopped. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const progress = busy ? Math.round((busy.done / Math.max(busy.of, 1)) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="presentation" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-title"
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="download-title" className="font-display text-3xl italic">
            Download photos
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} disabled={Boolean(busy)} className="rounded-full px-3 py-1 text-sm font-medium text-muted hover:bg-line/60 hover:text-ink disabled:opacity-40">
            Close
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Which photos">
          {(
            [
              ["all", `All ${total}`],
              ["favourites", `Favourites ${favourites.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={which === key}
              disabled={Boolean(busy) || (key === "favourites" && !favourites.length)}
              onClick={() => {
                setWhich(key);
                setFinished(new Set());
              }}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-40 ${which === key ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-sm text-muted">
          About {approxSize(count)}, saved as a zip file
          {!picker && count > perPart ? ` in ${Math.ceil(count / perPart)} parts so it fits on this device` : ""}.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {picker ? (
            <button type="button" onClick={() => run(0, true)} disabled={Boolean(busy) || !count} className="h-12 rounded-full bg-ink text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-50">
              {finished.has(-1) ? "Saved ✓ Download again" : `Download ${count} photo${count === 1 ? "" : "s"}`}
            </button>
          ) : (
            Array.from({ length: Math.max(1, Math.ceil(count / perPart)) }, (_, i) => {
              const size = parts[i]?.length ?? Math.min(perPart, count - i * perPart);
              const many = count > perPart;
              return (
                <button key={i} type="button" onClick={() => run(i, false)} disabled={Boolean(busy) || !count} className={`h-12 rounded-full text-sm font-semibold disabled:opacity-50 ${finished.has(i) ? "border border-line" : "bg-ink text-paper hover:opacity-90"}`}>
                  {finished.has(i) ? "✓ " : ""}
                  {many ? `Part ${i + 1}: ${size} photos` : `Download ${count} photo${count === 1 ? "" : "s"}`}
                </button>
              );
            })
          )}
        </div>

        {busy ? (
          <div className="mt-5" aria-live="polite">
            <div className="flex justify-between text-xs text-muted">
              <span>
                Preparing {busy.done} of {busy.of}…
              </span>
              <button type="button" onClick={() => abort.current?.abort()} className="font-semibold text-ink underline-offset-4 hover:underline">
                Cancel
              </button>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <p className="mt-4 text-xs text-muted">Photos are full web size (2400 px), the same ones shown here.</p>
      </div>
    </div>
  );
}
