"use client";

import { useEffect, useState } from "react";
import { saveBlob } from "@/lib/gallery/export-polaroid";
import { makeBeforeAfter, makeGridSheet } from "@/lib/projects/look-sheet-render";
import { SHEET_DESIGN_LABELS, type SheetDesign } from "@/lib/projects/look-sheet";
import type { PublicPhoto } from "@/lib/projects/gallery";

type Result = { design: SheetDesign; blob: Blob; url: string };

/** Pick one of your favourites, make the studio's look sheets for it, download them. */
export function LookSheetPanel({ projectName, favourites, designs, onClose }: Readonly<{ projectName: string; favourites: PublicPhoto[]; designs: SheetDesign[]; onClose: () => void }>) {
  const [picked, setPicked] = useState<PublicPhoto | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  // Free the preview images when the panel closes or makes new ones.
  useEffect(() => () => results.forEach((r) => URL.revokeObjectURL(r.url)), [results]);

  const make = async () => {
    if (!picked || busy) return;
    setError("");
    setResults([]);
    try {
      const made: Result[] = [];
      for (const design of designs) {
        setBusy(`Making ${SHEET_DESIGN_LABELS[design].toLowerCase()}…`);
        const blob = design === "grid" ? await makeGridSheet(picked.fullUrl) : await makeBeforeAfter(picked.fullUrl);
        made.push({ design, blob, url: URL.createObjectURL(blob) });
      }
      setResults(made);
    } catch {
      setError("That photo couldn't be made into a sheet. Try another one, or check your connection.");
    }
    setBusy("");
  };

  const fileName = (design: SheetDesign) => `${projectName.replace(/[^\w-]+/g, "-")}-${design}-${(picked?.downloadName ?? "photo").replace(/\.[^.]+$/, "")}.jpg`;

  return (
    <div role="dialog" aria-modal="true" aria-label="Look sheet" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-paper p-5 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl italic">Look sheet</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">Close</button>
        </div>
        <p className="mt-1 text-sm text-muted">Pick one of your favourites. You get the sheet to keep.</p>

        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {favourites.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPicked(p)}
              aria-pressed={picked?.id === p.id}
              className={`aspect-square overflow-hidden rounded-lg border-2 ${picked?.id === p.id ? "border-ink" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed gallery thumbnail */}
              <img src={p.thumbUrl} alt={p.downloadName} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={make} disabled={!picked || !!busy} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper disabled:opacity-50">
            {busy || "Make look sheet"}
          </button>
          {error ? <span role="alert" className="text-sm text-danger">{error}</span> : null}
        </div>

        <div className="mt-5 space-y-6">
          {results.map((r) => (
            <figure key={r.design}>
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL of a sheet made here */}
              <img src={r.url} alt={SHEET_DESIGN_LABELS[r.design]} className="w-full rounded-lg" />
              <figcaption className="mt-2 flex items-center justify-between text-sm">
                <span>{SHEET_DESIGN_LABELS[r.design]}</span>
                <button type="button" onClick={() => saveBlob(r.blob, fileName(r.design))} className="rounded-full border border-line px-4 py-1.5 font-semibold hover:border-ink">
                  Download
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
