"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicPhoto } from "@/lib/projects/gallery";
import { columnsFor, masonry } from "@/lib/projects/gallery-layout";
import { visitorId } from "@/lib/projects/visitor";
import { heartPhoto, loadDownloadList, loadFavourites, loadGalleryPhotos } from "./actions";
import { DownloadSheet } from "./download-sheet";
import { LookSheetPanel } from "./look-sheet";
import type { SheetDesign } from "@/lib/projects/look-sheet";
import { HeartIcon, Lightbox } from "./lightbox";

type Props = {
  token: string;
  projectName: string;
  initial: { photos: PublicPhoto[]; hasMore: boolean };
  total: number;
  lookSheets: SheetDesign[];
};

export function GalleryView({ token, projectName, initial, total, lookSheets }: Readonly<Props>) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [photos, setPhotos] = useState(initial.photos);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"all" | "favourites">("all");
  const [favourites, setFavourites] = useState<PublicPhoto[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [columns, setColumns] = useState(2);
  const [note, setNote] = useState<string | null>(null);
  const visitor = useRef<string>("");
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const hearted = useMemo(() => new Set(favourites.map((p) => p.id)), [favourites]);
  const shown = view === "favourites" ? favourites : photos;

  // Who this guest is (a random id kept in their browser) and what they've loved.
  useEffect(() => {
    visitor.current = visitorId();
    loadFavourites(token, visitor.current)
      .then((list) => setFavourites((current) => (current.length ? current : list)))
      .catch(() => undefined);
  }, [token]);

  // Columns follow the gallery's width.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setColumns(columnsFor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await loadGalleryPhotos(token, photos.length);
      setPhotos((all) => {
        const seen = new Set(all.map((p) => p.id));
        return [...all, ...page.photos.filter((p) => !seen.has(p.id))];
      });
      setHasMore(page.hasMore);
    } catch {
      setNote("Couldn't load more photos. Check your connection and scroll again.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, photos.length, token]);

  // Load the next page well before the guest reaches the bottom.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || view !== "all") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), { rootMargin: "1200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, view]);

  const toggleHeart = useCallback(
    (id: string) => {
      const photo = photos.find((p) => p.id === id) ?? favourites.find((p) => p.id === id);
      if (!photo) return;
      const on = !hearted.has(id);
      setFavourites((list) => (on ? [...list, photo] : list.filter((p) => p.id !== id)));
      heartPhoto(token, visitor.current || visitorId(), id, on)
        .then((ok) => {
          if (!ok) {
            setFavourites((list) => (on ? list.filter((p) => p.id !== id) : [...list, photo]));
            setNote("Couldn't save that favourite. Try again.");
          }
        })
        .catch(() => setNote("Couldn't save that favourite. Check your connection."));
    },
    [favourites, hearted, photos, token],
  );

  const layout = useMemo(() => masonry(shown, columns), [shown, columns]);

  return (
    <>
      <div className="sticky z-30 -mx-4 border-b border-line/70 bg-paper/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-full bg-line/60 p-1" role="tablist" aria-label="Photos to show">
            {(
              [
                ["all", `All ${total}`],
                ["favourites", `Favourites ${favourites.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${view === key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {key === "favourites" ? <HeartIcon filled={view === key && favourites.length > 0} className="h-4 w-4" /> : null}
                {label}
              </button>
            ))}
          </div>
          {lookSheets.length > 0 && favourites.length > 0 ? (
            <button type="button" onClick={() => setSheetOpen(true)} className="rounded-full border border-line px-5 py-2 text-sm font-semibold hover:border-ink">
              Look sheet
            </button>
          ) : null}
          <button type="button" onClick={() => setDownloading(true)} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper hover:opacity-90">
            Download
          </button>
        </div>
      </div>

      {note ? (
        <p role="status" className="mx-auto mt-4 max-w-6xl rounded-xl bg-line/60 px-4 py-2 text-sm text-muted">
          {note}{" "}
          <button type="button" className="font-semibold text-ink underline-offset-4 hover:underline" onClick={() => setNote(null)}>
            OK
          </button>
        </p>
      ) : null}

      <div ref={gridRef} className="mx-auto mt-5 max-w-6xl">
        {view === "favourites" && !favourites.length ? (
          <div className="px-6 py-20 text-center">
            <HeartIcon filled={false} className="mx-auto h-8 w-8 text-muted" />
            <p className="mt-3 font-display text-2xl italic">No favourites yet</p>
            <p className="mx-auto mt-2 max-w-xs text-sm text-muted">Tap the heart on any photo to keep it here. You can download just your favourites, too.</p>
          </div>
        ) : (
          <div className="flex items-start gap-2 sm:gap-3">
            {layout.map((col, c) => (
              <ul key={c} className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
                {col.map((i) => {
                  const p = shown[i];
                  return (
                    <li key={p.id}>
                      <Tile photo={p} index={i} total={view === "favourites" ? favourites.length : total} hearted={hearted.has(p.id)} onOpen={() => setOpen(i)} onHeart={() => toggleHeart(p.id)} />
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        )}
        {view === "all" ? (
          <div ref={sentinel} className="flex h-24 items-center justify-center text-sm text-muted" aria-live="polite">
            {loading ? "Loading more photos…" : hasMore ? "" : photos.length > 12 ? "That's every photo." : ""}
          </div>
        ) : null}
      </div>

      {open !== null && shown[open] ? (
        <Lightbox
          photos={shown}
          index={open}
          total={view === "favourites" ? favourites.length : total}
          hearted={(id) => hearted.has(id)}
          onHeart={toggleHeart}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onNearEnd={() => view === "all" && void loadMore()}
        />
      ) : null}

      {sheetOpen ? <LookSheetPanel projectName={projectName} favourites={favourites} designs={lookSheets} onClose={() => setSheetOpen(false)} /> : null}
      {downloading ? (
        <DownloadSheet projectName={projectName} total={total} favourites={favourites} load={() => loadDownloadList(token)} onClose={() => setDownloading(false)} />
      ) : null}
    </>
  );
}

function Tile({ photo, index, total, hearted, onOpen, onHeart }: Readonly<{ photo: PublicPhoto; index: number; total: number; hearted: boolean; onOpen: () => void; onHeart: () => void }>) {
  const [loaded, setLoaded] = useState(false);
  const [pop, setPop] = useState(false);
  return (
    <div className="group relative overflow-hidden rounded-md sm:rounded-lg" style={{ aspectRatio: `${photo.width} / ${photo.height}`, backgroundColor: photo.tone ?? "var(--line)" }}>
      <button type="button" onClick={onOpen} className="block h-full w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" aria-label={`Open photo ${index + 1} of ${total}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        <img
          // A photo can finish loading before the page is interactive, so its
          // load event is missed: check once the element is attached.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0 && !loaded) setLoaded(true);
          }}
          src={photo.thumbUrl}
          alt=""
          width={photo.width}
          height={photo.height}
          loading={index < 8 ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition duration-500 ease-out motion-reduce:transition-none ${loaded ? "scale-100 opacity-100" : "scale-[1.02] opacity-0"} group-hover:scale-[1.015]`}
        />
      </button>
      <button
        type="button"
        onClick={() => {
          setPop(true);
          window.setTimeout(() => setPop(false), 300);
          onHeart();
        }}
        aria-pressed={hearted}
        aria-label={hearted ? "Remove from favourites" : "Add to favourites"}
        className={`absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 ${hearted ? "sm:opacity-100" : ""} ${pop ? "scale-125" : "scale-100"} motion-reduce:transition-none`}
      >
        <HeartIcon filled={hearted} className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
