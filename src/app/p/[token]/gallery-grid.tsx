"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveBlob } from "@/lib/gallery/export-polaroid";
import type { PublicPhoto } from "@/lib/projects/gallery";
import { loadGalleryPhotos } from "./actions";

type Props = { token: string; initial: { photos: PublicPhoto[]; hasMore: boolean }; total: number };

export function ProjectGalleryGrid({ token, initial, total }: Readonly<Props>) {
  const [photos, setPhotos] = useState(initial.photos);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, startTransition] = useTransition();
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function more() {
    startTransition(async () => {
      const page = await loadGalleryPhotos(token, photos.length);
      setPhotos((all) => [...all, ...page.photos.filter((p) => !all.some((a) => a.id === p.id))]);
      setHasMore(page.hasMore);
    });
  }

  function show(i: number) {
    setOpen(i);
    dialogRef.current?.showModal();
  }

  if (!photos.length) return <p className="text-center text-muted">No photos here yet.</p>;

  return (
    <>
      <ul className="columns-2 gap-2 sm:columns-3 lg:columns-4 [&>li]:mb-2">
        {photos.map((photo, i) => (
          <li key={photo.id} className="break-inside-avoid">
            <button type="button" onClick={() => show(i)} className="block w-full overflow-hidden rounded-lg bg-line/50" aria-label={`Open photo ${i + 1} of ${total}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
              <img
                src={photo.thumbUrl}
                alt=""
                width={photo.width}
                height={photo.height}
                loading={i < 8 ? "eager" : "lazy"}
                className="h-auto w-full transition duration-300 hover:scale-[1.02]"
              />
            </button>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <div className="mt-8 text-center">
          <button type="button" onClick={more} disabled={loading} className="rounded-full border border-line bg-surface px-6 py-3 text-sm font-semibold hover:border-ink disabled:opacity-60">
            {loading ? "Loading…" : `Show more (${photos.length} of ${total})`}
          </button>
        </div>
      ) : null}

      <Lightbox dialogRef={dialogRef} photos={photos} index={open} total={total} onIndex={setOpen} />
    </>
  );
}

function Lightbox({
  dialogRef,
  photos,
  index,
  total,
  onIndex,
}: Readonly<{
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  photos: PublicPhoto[];
  index: number | null;
  total: number;
  onIndex: (i: number | null) => void;
}>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const photo = index === null ? null : photos[index];

  const go = (delta: number) => {
    if (index === null) return;
    setError(null);
    onIndex((index + delta + photos.length) % photos.length);
  };

  // Arrow keys and swipes move between photos; Escape, Close and a tap on the dim area close it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchX.current = e.touches[0].clientX;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      touchX.current = null;
    };
    dialog.addEventListener("keydown", onKey);
    dialog.addEventListener("click", onBackdrop);
    dialog.addEventListener("touchstart", onTouchStart, { passive: true });
    dialog.addEventListener("touchend", onTouchEnd);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      dialog.removeEventListener("click", onBackdrop);
      dialog.removeEventListener("touchstart", onTouchStart);
      dialog.removeEventListener("touchend", onTouchEnd);
    };
  });

  async function save() {
    if (!photo) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(photo.fullUrl);
      if (!res.ok) throw new Error("The link has expired. Reload the page and try again.");
      saveBlob(await res.blob(), photo.downloadName);
    } catch (e) {
      setError((e as Error).message || "Couldn't save the photo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={index === null ? "Photo" : `Photo ${index + 1} of ${total}`}
      onClose={() => {
        setError(null);
        onIndex(null);
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-[#171310]/95 p-0 text-white backdrop:bg-black/30"
    >
      {photo ? (
        <div className="pointer-events-none flex h-full flex-col items-center justify-center gap-4 px-3 py-4 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
          <div className="flex w-full max-w-5xl items-center justify-between text-sm text-white/80">
            <span>
              {(index ?? 0) + 1} / {total}
            </span>
            <form method="dialog">
              <button type="submit" className="rounded-full px-3 py-1.5 text-white hover:bg-white/10" aria-label="Close">
                Close ✕
              </button>
            </form>
          </div>
          <div className="flex min-h-0 flex-1 items-center gap-3">
            {photos.length > 1 ? (
              <button type="button" onClick={() => go(-1)} className="hidden h-11 w-11 shrink-0 rounded-full bg-white/10 text-xl hover:bg-white/20 sm:block" aria-label="Previous">
                ‹
              </button>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img key={photo.id} src={photo.fullUrl} alt="" className="max-h-full max-w-full object-contain" />
            {photos.length > 1 ? (
              <button type="button" onClick={() => go(1)} className="hidden h-11 w-11 shrink-0 rounded-full bg-white/10 text-xl hover:bg-white/20 sm:block" aria-label="Next">
                ›
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#221c18] hover:opacity-90 disabled:opacity-60">
              {saving ? "Saving…" : "Save photo"}
            </button>
            {error ? <span className="text-sm text-red-300">{error}</span> : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
