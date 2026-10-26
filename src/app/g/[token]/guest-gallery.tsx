"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import type { GalleryPhoto } from "@/lib/gallery/queries";
import { exportPolaroidPng, saveBlob } from "@/lib/gallery/export-polaroid";
import type { CardText, Palette, PolaroidTemplate } from "@/lib/polaroid/types";

type Props = {
  photos: GalleryPhoto[];
  design: { template: PolaroidTemplate; palette: Palette; text: CardText; filterId: string };
  fileStem: string;
};

export function GuestGallery({ photos, design, fileStem }: Props) {
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (delta: number) => setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length)),
    [photos.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, step]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, i) => (
          <li key={photo.id} className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setOpen(i)}
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

      {open !== null ? (
        <Lightbox
          photo={photos[open]}
          index={open}
          total={photos.length}
          design={design}
          fileName={`${fileStem}-${open + 1}`}
          onClose={close}
          onStep={step}
        />
      ) : null}
    </>
  );
}

function Lightbox({
  photo,
  index,
  total,
  design,
  fileName,
  onClose,
  onStep,
}: {
  photo: GalleryPhoto;
  index: number;
  total: number;
  design: Props["design"];
  fileName: string;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Polaroid ${index + 1} of ${total}`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#171310]/90 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) onStep(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex w-full max-w-md items-center justify-between text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <span>
          {index + 1} / {total}
        </span>
        <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-white hover:bg-white/10" aria-label="Close">
          Close ✕
        </button>
      </div>

      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {total > 1 ? (
          <button type="button" onClick={() => onStep(-1)} className="hidden h-11 w-11 rounded-full bg-white/10 text-xl text-white hover:bg-white/20 sm:block" aria-label="Previous">
            ‹
          </button>
        ) : null}
        <div ref={cardRef} className="w-[min(72vw,22rem)] max-h-[62vh] [&_svg]:h-auto [&_svg]:max-h-[62vh] [&_svg]:w-full">
          <PolaroidCard
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
          <button type="button" onClick={() => onStep(1)} className="hidden h-11 w-11 rounded-full bg-white/10 text-xl text-white hover:bg-white/20 sm:block" aria-label="Next">
            ›
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-center gap-3" onClick={(e) => e.stopPropagation()}>
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
          className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
        >
          Original photo
        </a>
      </div>
      {error ? <p className="text-sm text-[#f2b8b5]">{error}</p> : null}
    </div>
  );
}
