"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveBlob } from "@/lib/gallery/export-polaroid";
import type { PublicPhoto } from "@/lib/projects/gallery";

type Props = {
  photos: PublicPhoto[];
  index: number;
  total: number;
  hearted: (id: string) => boolean;
  onHeart: (id: string) => void;
  onIndex: (i: number) => void;
  onClose: () => void;
  onNearEnd: () => void;
};

const SWIPE_FRACTION = 0.18;
const DISMISS_PX = 120;
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 280;

type Gesture = {
  pointers: Map<number, { x: number; y: number }>;
  mode: "none" | "swipe" | "dismiss" | "pan" | "pinch";
  startX: number;
  startY: number;
  startTime: number;
  startDistance: number;
  startScale: number;
  startPan: { x: number; y: number };
  dx: number;
  dy: number;
};

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Full-screen photo viewer: swipe between photos, pinch or double-tap to zoom, swipe down to close. */
export function Lightbox({ photos, index, total, hearted, onHeart, onIndex, onClose, onNearEnd }: Readonly<Props>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [chrome, setChrome] = useState(true);
  const [saving, setSaving] = useState(false);
  // A save message belongs to the photo it was about, so it disappears on swipe.
  const [message, setMessageFor] = useState<{ id: string; text: string } | null>(null);
  const [loadedFull, setLoadedFull] = useState<Record<string, boolean>>({});
  const zoom = useRef({ scale: 1, x: 0, y: 0 });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<number | null>(null);
  const g = useRef<Gesture>({ pointers: new Map(), mode: "none", startX: 0, startY: 0, startTime: 0, startDistance: 0, startScale: 1, startPan: { x: 0, y: 0 }, dx: 0, dy: 0 });

  const photo = photos[index];
  const prev = index > 0 ? photos[index - 1] : null;
  const next = index < photos.length - 1 ? photos[index + 1] : null;

  // --- Rendering helpers (direct style writes: smooth, no re-render per frame) ---
  const setTrack = useCallback((x: number, y = 0, animate = false, fade = 1) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate && !reducedMotion() ? "transform 260ms cubic-bezier(.2,.8,.2,1)" : "none";
    track.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (rootRef.current) rootRef.current.style.backgroundColor = `rgba(12, 10, 9, ${0.96 * fade})`;
  }, []);

  const applyZoom = useCallback((animate = false) => {
    const el = zoomRef.current;
    if (!el) return;
    const { scale, x, y } = zoom.current;
    el.style.transition = animate && !reducedMotion() ? "transform 220ms ease-out" : "none";
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }, []);

  const resetZoom = useCallback(
    (animate = false) => {
      zoom.current = { scale: 1, x: 0, y: 0 };
      applyZoom(animate);
    },
    [applyZoom],
  );

  const go = useCallback(
    (delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= photos.length) {
        setTrack(0, 0, true);
        return;
      }
      const width = rootRef.current?.clientWidth ?? window.innerWidth;
      setTrack(-delta * width, 0, true);
      window.setTimeout(
        () => {
          resetZoom();
          onIndex(target);
        },
        reducedMotion() ? 0 : 240,
      );
    },
    [index, photos.length, onIndex, resetZoom, setTrack],
  );

  // After the index changes, the new photo sits in the middle slot: snap the track back.
  useLayoutEffect(() => {
    setTrack(0);
  }, [index, setTrack]);

  // Ask for more photos before the guest reaches the last loaded one.
  useEffect(() => {
    if (photos.length - index < 6) onNearEnd();
  }, [index, photos.length, onNearEnd]);

  // Preload the full-size photos either side.
  useEffect(() => {
    for (const p of [prev, next, photos[index + 2]]) {
      if (p) {
        const img = new Image();
        img.decoding = "async";
        img.src = p.fullUrl;
      }
    }
  }, [prev, next, photos, index]);

  // Keyboard, focus and page scroll while open.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "f" && photo) onHeart(photo.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, onHeart, photo]);

  // --- Gestures ---
  function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button, a")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const s = g.current;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      s.mode = "pinch";
      s.startDistance = distance(a, b);
      s.startScale = zoom.current.scale;
      return;
    }
    s.mode = "none";
    s.startX = e.clientX;
    s.startY = e.clientY;
    s.startTime = e.timeStamp;
    s.startPan = { x: zoom.current.x, y: zoom.current.y };
    s.dx = 0;
    s.dy = 0;
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = g.current;
    if (!s.pointers.has(e.pointerId)) return;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.mode === "pinch" && s.pointers.size >= 2) {
      const [a, b] = [...s.pointers.values()];
      zoom.current.scale = Math.min(MAX_ZOOM, Math.max(1, (s.startScale * distance(a, b)) / Math.max(s.startDistance, 1)));
      applyZoom();
      return;
    }
    s.dx = e.clientX - s.startX;
    s.dy = e.clientY - s.startY;
    if (s.mode === "none" && Math.hypot(s.dx, s.dy) > 8) {
      if (zoom.current.scale > 1.01) s.mode = "pan";
      else s.mode = Math.abs(s.dx) > Math.abs(s.dy) ? "swipe" : s.dy > 0 ? "dismiss" : "none";
    }
    if (s.mode === "swipe") {
      // Resist at the ends.
      const atEdge = (s.dx > 0 && index === 0) || (s.dx < 0 && index === photos.length - 1);
      setTrack(atEdge ? s.dx * 0.3 : s.dx);
    } else if (s.mode === "dismiss") {
      setTrack(0, s.dy, false, Math.max(0.2, 1 - s.dy / 500));
    } else if (s.mode === "pan") {
      zoom.current.x = s.startPan.x + s.dx;
      zoom.current.y = s.startPan.y + s.dy;
      applyZoom();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = g.current;
    s.pointers.delete(e.pointerId);
    if (s.mode === "pinch") {
      if (s.pointers.size === 0) {
        if (zoom.current.scale < 1.05) resetZoom(true);
        s.mode = "none";
      }
      return;
    }
    const width = rootRef.current?.clientWidth ?? window.innerWidth;
    const elapsed = e.timeStamp - s.startTime;
    if (s.mode === "swipe") {
      const fast = Math.abs(s.dx) / Math.max(elapsed, 1) > 0.5;
      if (Math.abs(s.dx) > width * SWIPE_FRACTION || (fast && Math.abs(s.dx) > 30)) go(s.dx < 0 ? 1 : -1);
      else setTrack(0, 0, true);
    } else if (s.mode === "dismiss") {
      if (s.dy > DISMISS_PX) onClose();
      else setTrack(0, 0, true);
    } else if (s.mode === "none" && elapsed < 300) {
      handleTap(e.clientX, e.clientY, e.timeStamp);
    }
    s.mode = "none";
  }

  function handleTap(x: number, y: number, now: number) {
    const last = lastTap.current;
    if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(x - last.x, y - last.y) < 30) {
      if (tapTimer.current) window.clearTimeout(tapTimer.current);
      lastTap.current = null;
      if (zoom.current.scale > 1.01) resetZoom(true);
      else {
        // Zoom in around the tapped point.
        const rect = zoomRef.current?.getBoundingClientRect();
        const cx = rect ? x - (rect.left + rect.width / 2) : 0;
        const cy = rect ? y - (rect.top + rect.height / 2) : 0;
        zoom.current = { scale: 2.5, x: -cx * 1.5, y: -cy * 1.5 };
        applyZoom(true);
      }
      return;
    }
    lastTap.current = { t: now, x, y };
    tapTimer.current = window.setTimeout(() => setChrome((c) => !c), DOUBLE_TAP_MS);
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey) return; // trackpad pinch arrives as ctrl+wheel
    zoom.current.scale = Math.min(MAX_ZOOM, Math.max(1, zoom.current.scale * (1 - e.deltaY / 200)));
    if (zoom.current.scale <= 1.01) zoom.current = { scale: 1, x: 0, y: 0 };
    applyZoom();
  }

  // --- Save ---
  async function save() {
    if (!photo) return;
    const setMessage = (text: string | null) => setMessageFor(text ? { id: photo.id, text } : null);
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(photo.fullUrl);
      if (!res.ok) throw new Error("This link has timed out. Reload the page and try again.");
      const blob = await res.blob();
      const file = new File([blob], photo.downloadName, { type: "image/jpeg" });
      const touch = window.matchMedia("(pointer: coarse)").matches;
      // On phones the share sheet offers "Save to Photos"; elsewhere download the file.
      if (touch && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
        }
      }
      saveBlob(blob, photo.downloadName);
      setMessage("Saved to your downloads.");
    } catch (err) {
      setMessage((err as Error).message || "Couldn't save the photo. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!photo) return null;
  const isHearted = hearted(photo.id);

  const slide = (p: PublicPhoto | null, offset: -1 | 0 | 1) => (
    <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translateX(${offset * 100}%)` }} aria-hidden={offset !== 0}>
      {p ? (
        <div ref={offset === 0 ? zoomRef : undefined} className="relative flex h-full w-full items-center justify-center will-change-transform">
          <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${p.width} / ${p.height}`, height: p.height >= p.width ? "100%" : "auto", width: p.width > p.height ? "100%" : "auto", backgroundColor: p.tone ?? "#2a2420" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL; thumbnail shows at once */}
            <img src={p.thumbUrl} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL; full size fades in over it */}
            <img
              ref={(img) => {
                if (img?.complete && img.naturalWidth > 0 && !loadedFull[p.id]) setLoadedFull((m) => ({ ...m, [p.id]: true }));
              }}
              src={p.fullUrl}
              alt={offset === 0 ? `Photo ${index + 1} of ${total}` : ""}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${loadedFull[p.id] ? "opacity-100" : "opacity-0"}`}
              draggable={false}
              decoding="async"
              onLoad={() => setLoadedFull((m) => (m[p.id] ? m : { ...m, [p.id]: true }))}
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${total}`}
      className="fixed inset-0 z-50 touch-none select-none text-white"
      style={{ backgroundColor: "rgba(12, 10, 9, 0.96)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div className="absolute inset-0 overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div ref={trackRef} className="absolute inset-0 will-change-transform" style={{ top: "calc(56px + env(safe-area-inset-top))", bottom: "calc(84px + env(safe-area-inset-bottom))" }}>
          {slide(prev, -1)}
          {slide(photo, 0)}
          {slide(next, 1)}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 transition-opacity duration-200 ${chrome ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ paddingTop: "max(10px, env(safe-area-inset-top))", paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}
      >
        <span className="text-sm tabular-nums text-white/75">
          {index + 1} / {total}
        </span>
        <button ref={closeRef} type="button" onClick={onClose} className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">
          Close
        </button>
      </div>

      {photos.length > 1 ? (
        <>
          <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo" className={`absolute left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl hover:bg-white/20 disabled:opacity-30 sm:flex ${chrome ? "" : "sm:hidden"}`}>
            ‹
          </button>
          <button type="button" onClick={() => go(1)} disabled={index >= photos.length - 1} aria-label="Next photo" className={`absolute right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl hover:bg-white/20 disabled:opacity-30 sm:flex ${chrome ? "" : "sm:hidden"}`}>
            ›
          </button>
        </>
      ) : null}

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 transition-opacity duration-200 ${chrome ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onHeart(photo.id)}
            aria-pressed={isHearted}
            aria-label={isHearted ? "Remove from favourites" : "Add to favourites"}
            className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold hover:bg-white/20"
          >
            <HeartIcon filled={isHearted} />
            {isHearted ? "Favourite" : "Love it"}
          </button>
          <button type="button" onClick={save} disabled={saving} className="h-12 rounded-full bg-white px-6 text-sm font-semibold text-[#221c18] hover:opacity-90 disabled:opacity-60">
            {saving ? "Saving…" : "Save photo"}
          </button>
        </div>
        <p className="min-h-5 text-xs text-white/70" aria-live="polite">
          {message?.id === photo.id ? message.text : ""}
        </p>
      </div>
    </div>
  );
}

export function HeartIcon({ filled, className = "h-5 w-5" }: Readonly<{ filled: boolean; className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
        fill={filled ? "#e5486b" : "none"}
        stroke={filled ? "#e5486b" : "currentColor"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
