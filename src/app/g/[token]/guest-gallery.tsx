"use client";

import { useEffect, useRef, useState } from "react";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import type { GalleryPhoto } from "@/lib/gallery/queries";
import { exportPolaroidPng, saveBlob } from "@/lib/gallery/export-polaroid";
import type { CardText, Palette, PolaroidTemplate } from "@/lib/polaroid/types";

type Design = { template: PolaroidTemplate; palette: Palette; text: CardText; filterId: string };

type Props = {
  photos: GalleryPhoto[];
  design: Design;
  fileStem: string;
};

export function GuestGallery({ photos, design, fileStem }: Readonly<Props>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  function show(index: number) {
    setOpen(index);
    dialogRef.current?.showModal();
  }

  const step = (delta: number) => setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length));

  return (
    <>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <li key={photo.id} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => show(i)}
              className="w-full max-w-[14rem] transition hover:-translate-y-1"
              aria-label={`Open polaroid ${i + 1} of ${photos.length}`}
            >
              <PolaroidCard
                uid={`g-${photo.id}`}
                template={design.template}
                palette={design.palette}
                text={design.text}
                filterId={design.filterId}
                photoHref={photo.thumbUrl}
                className="w-full shadow-lg"
              />
            </button>
          </li>
        ))}
      </ul>

      <Lightbox
        dialogRef={dialogRef}
        photos={photos}
        index={open}
        design={design}
        fileStem={fileStem}
        onStep={step}
        onClosed={() => setOpen(null)}
      />
    </>
  );
}

function Lightbox({
  dialogRef,
  photos,
  index,
  design,
  fileStem,
  onStep,
  onClosed,
}: Readonly<{
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  photos: GalleryPhoto[];
  index: number | null;
  design: Design;
  fileStem: string;
  onStep: (delta: number) => void;
  onClosed: () => void;
}>) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  const photo = index === null ? null : photos[index];
  const total = photos.length;
  const fileName = index === null ? fileStem : `${fileStem}-${index + 1}`;

  const go = (delta: number) => {
    setError(null);
    onStep(delta);
  };

  // Arrow keys and swipes move between photos. Escape (native to <dialog>),
  // the Close button and a tap on the dimmed area all close it.
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

  async function savePolaroid() {
    const svg = cardRef.current?.querySelector("svg");
    if (!svg) return;
    setSaving(true);
    setError(null);
    try {
      saveBlob(await exportPolaroidPng(svg), `${fileName}.png`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={index === null ? "Polaroid" : `Polaroid ${index + 1} of ${total}`}
      onClose={() => {
        setError(null);
        onClosed();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-[#171310]/95 p-0 text-white backdrop:bg-black/30 backdrop:backdrop-blur-sm"
    >
      {photo ? (
        <div className="pointer-events-none flex h-full flex-col items-center justify-center gap-6 px-4 py-6 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
          <div className="flex w-full max-w-md items-center justify-between text-sm text-white/80">
            <span>
              {(index ?? 0) + 1} / {total}
            </span>
            <form method="dialog">
              <button type="submit" className="rounded-full px-3 py-1.5 text-white hover:bg-white/10" aria-label="Close">
                Close ✕
              </button>
            </form>
          </div>

          <div className="flex items-center gap-3">
            {total > 1 ? (
              <button type="button" onClick={() => go(-1)} className="hidden h-11 w-11 rounded-full bg-white/10 text-xl hover:bg-white/20 sm:block" aria-label="Previous">
                ‹
              </button>
            ) : null}
            <div ref={cardRef} className="w-[min(72vw,22rem)] [&_svg]:h-auto [&_svg]:max-h-[62vh] [&_svg]:w-full">
              <PolaroidCard
                key={photo.id}
                uid={`lb-${photo.id}`}
                template={design.template}
                palette={design.palette}
                text={design.text}
                filterId={design.filterId}
                photoHref={photo.thumbUrl}
                className="shadow-2xl"
              />
            </div>
            {total > 1 ? (
              <button type="button" onClick={() => go(1)} className="hidden h-11 w-11 rounded-full bg-white/10 text-xl hover:bg-white/20 sm:block" aria-label="Next">
                ›
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={savePolaroid}
              disabled={saving}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#221c18] hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save polaroid"}
            </button>
            <a
              href={photo.fullUrl}
              download={`${fileName}-original.jpg`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold hover:bg-white/10"
            >
              Original photo
            </a>
          </div>
          {error ? <p className="text-sm text-[#f2b8b5]">{error}</p> : null}
        </div>
      ) : null}
    </dialog>
  );
}
