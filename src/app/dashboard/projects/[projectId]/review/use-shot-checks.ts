"use client";

import { useEffect, useRef, useState } from "react";
import type { ShotCheck } from "@/lib/quality/flags";
import { checkPhoto } from "@/lib/quality/scan";
import type { ReviewItem } from "@/lib/projects/review";
import { loadReviewLinks } from "./actions";

/** Photos fetched and checked per round (and saved together). */
const ROUND = 12;

/**
 * Checks every photo that hasn't been checked yet for missed shots, in the
 * background, a few at a time. Results go to `onChecked` after each round.
 */
export function useShotChecks(projectId: string, items: ReviewItem[], onChecked: (checks: Record<string, ShotCheck>) => void) {
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const latest = useRef({ items, onChecked });
  useEffect(() => {
    latest.current = { items, onChecked };
  });

  useEffect(() => {
    const abort = new AbortController();
    const todo = latest.current.items.filter((i) => !i.check).map((i) => i.id);
    if (!todo.length) return;
    void (async () => {
      setProgress({ done: 0, total: todo.length });
      let done = 0;
      for (let i = 0; i < todo.length && !abort.signal.aborted; i += ROUND) {
        const ids = todo.slice(i, i + ROUND);
        const links = await loadReviewLinks(projectId, ids).catch(() => []);
        const checks: Record<string, ShotCheck> = {};
        for (const link of links) {
          if (abort.signal.aborted) return;
          try {
            const r = await checkPhoto(link.plainThumb, abort.signal);
            checks[link.id] = { ...r, faces: r.faces ?? 0, eyesClosed: r.eyesClosed ?? 0 };
          } catch {
            // A photo that can't be checked just isn't flagged.
          }
        }
        done += ids.length;
        if (abort.signal.aborted) return;
        if (Object.keys(checks).length) latest.current.onChecked(checks);
        setProgress({ done, total: todo.length });
      }
      setProgress({ done: 0, total: 0 });
    })();
    return () => abort.abort();
  }, [projectId]);

  return progress;
}
