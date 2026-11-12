"use client";

import { useEffect, useRef, useState } from "react";
import { decodeUrl, encodeJpeg, planPhoto, renderLook, type Pixels } from "@/lib/looks/client";
import { looksFor, LOOKS, type Group } from "@/lib/looks/data";
import type { StylePrefs } from "@/lib/looks/engine";
import type { PlanReply } from "@/lib/looks/looks.worker";
import type { ReviewItem, ReviewLinks } from "@/lib/projects/review";

/** Long edge of the swatch pictures. */
const SWATCH_EDGE = 240;

export type Choice = string; // a look id, or ORIGINAL
export const ORIGINAL = "original";

/** Long edge of the big preview: sharp on this screen, never more than the stored photo. */
function previewEdge(): number {
  if (typeof window === "undefined") return 1600;
  return Math.min(2400, Math.round(Math.max(window.innerWidth, window.innerHeight) * Math.min(window.devicePixelRatio || 1, 2)));
}

type Loaded = { photoId: string; preview: Pixels; small: Pixels; plan: PlanReply };

/**
 * Loads a photo's plain copy, works out its light and renders the looks:
 * small swatches for the picker and a screen-size preview of the chosen one.
 */
export function usePhotoEditor(item: ReviewItem | null, links: ReviewLinks | null, style: StylePrefs, choice: Choice | null, showAll: boolean) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swatches, setSwatches] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const objectUrls = useRef<string[]>([]);

  const photoId = item?.id ?? null;
  const plainFull = links?.plainFull ?? null;
  const plainThumb = links?.plainThumb ?? null;
  const storedGroup = item?.lighting ?? undefined;

  // 1. Load and measure the photo.
  useEffect(() => {
    if (!photoId || !plainFull || !plainThumb) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const [preview, small] = await Promise.all([decodeUrl(plainFull, previewEdge(), abort.signal), decodeUrl(plainThumb, SWATCH_EDGE, abort.signal)]);
        const plan = await planPhoto(preview, { group: storedGroup, style });
        if (!abort.signal.aborted) {
          setError(null);
          setSwatches({});
          setLoaded({ photoId, preview, small, plan });
        }
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).name === "AbortError" ? null : "Couldn't load this photo.");
      }
    })();
    return () => abort.abort();
  }, [photoId, plainFull, plainThumb, storedGroup, style]);

  const ready = loaded && loaded.photoId === photoId ? loaded : null;
  const group: Group | null = ready?.plan.group ?? item?.lighting ?? null;

  // 2. Swatches: the photo's own five looks first, then the rest when shown.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const order = [...looksFor(ready.plan.group), ...(showAll ? LOOKS.filter((l) => l.group !== ready.plan.group) : [])];
    (async () => {
      for (const look of order) {
        if (cancelled) return;
        const out = await renderLook(ready.small, ready.plan.features, ready.plan.group, look.id, 1, ready.photoId);
        const blob = await encodeJpeg(out, SWATCH_EDGE, 0.82);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrls.current.push(url);
        setSwatches((s) => (s[look.id] ? s : { ...s, [look.id]: url }));
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, showAll]);

  // 3. The big preview of the chosen look.
  const savedEdit = item && links?.editedFull && choice === item.look ? links.editedFull : null;
  useEffect(() => {
    if (!ready || !choice || choice === ORIGINAL || savedEdit) return;
    let cancelled = false;
    (async () => {
      const out = await renderLook(ready.preview, ready.plan.features, ready.plan.group, choice, 1, ready.photoId);
      const blob = await encodeJpeg(out, 99999, 0.92);
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      objectUrls.current.push(url);
      setPreview({ key: `${ready.photoId}:${choice}`, url });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, choice, savedEdit]);

  // Free the rendered pictures when leaving the screen.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  let shown: string | null = null;
  let rendering = false;
  if (choice === ORIGINAL) shown = plainFull;
  else if (savedEdit) shown = savedEdit;
  else if (preview && photoId && preview.key === `${photoId}:${choice}`) shown = preview.url;
  else {
    rendering = Boolean(choice);
    // While the preview renders, show the swatch (instant) or the stored picture.
    shown = (choice && ready ? swatches[choice] : null) ?? links?.editedFull ?? plainFull;
  }

  return {
    ready: Boolean(ready),
    error,
    group,
    suggested: ready?.plan.lookId ?? null,
    swatches: ready ? swatches : {},
    shown,
    rendering,
  };
}
