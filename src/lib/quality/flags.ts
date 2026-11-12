// Which photos are probably misses: soft focus, closed eyes, badly exposed,
// or a near-copy of a better frame. Decided across the whole project, so a
// dim reception isn't judged against a sunny ceremony's sharpness.
import { hamming } from "./metrics";

export type ShotCheck = {
  sharpness: number;
  brightness: number;
  clipped: number;
  dark: number;
  dhash: string;
  faces: number;
  eyesClosed: number;
};

export type Flag = "blurry" | "eyes_closed" | "similar" | "too_dark" | "too_bright";

export const FLAG_LABELS: Record<Flag, string> = {
  blurry: "Soft focus",
  eyes_closed: "Eyes closed",
  similar: "Similar to a better shot",
  too_dark: "Too dark",
  too_bright: "Washed out",
};

/** Two frames in a row this close (bits of 64) are the same moment. */
export const SIMILAR_BITS = 6;
/** Sharpness below this share of the project's middle photo counts as soft. */
export const SOFT_SHARE = 0.3;
/** …and never flag a photo this sharp, however sharp the rest are. */
export const ALWAYS_SHARP = 25;
/** With few photos there's no middle to compare with: use this floor. */
export const SOFT_FLOOR = 6;

export type Flagged = { flags: Flag[]; similarTo: string | null };

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A frame's overall goodness, for picking the keeper among similar frames. */
function goodness(c: ShotCheck): number {
  return Math.log(1 + c.sharpness) - (c.eyesClosed > 0 ? 2 : 0) - (c.brightness < 0.06 || c.clipped > 0.35 ? 1 : 0);
}

/**
 * Flags for photos in shooting order. Photos without a check (not yet
 * looked at) get no flags.
 */
export function flagShots(photos: { id: string; check: ShotCheck | null }[]): Map<string, Flagged> {
  const out = new Map<string, Flagged>();
  const checked = photos.filter((p): p is { id: string; check: ShotCheck } => Boolean(p.check));
  const mid = median(checked.map((p) => p.check.sharpness));
  const softBelow = checked.length >= 8 ? Math.min(ALWAYS_SHARP, mid * SOFT_SHARE) : SOFT_FLOOR;

  for (const p of photos) out.set(p.id, { flags: [], similarTo: null });
  for (const { id, check } of checked) {
    const f = out.get(id)!;
    if (check.sharpness < softBelow) f.flags.push("blurry");
    if (check.faces > 0 && check.eyesClosed > 0) f.flags.push("eyes_closed");
    if (check.brightness < 0.06 && check.dark > 0.6) f.flags.push("too_dark");
    if (check.clipped > 0.35) f.flags.push("too_bright");
  }

  // Runs of near-identical frames (a burst): keep the best, flag the rest.
  let run: { id: string; check: ShotCheck }[] = [];
  const closeRun = () => {
    if (run.length > 1) {
      const best = run.reduce((a, b) => (goodness(b.check) > goodness(a.check) ? b : a), run[0]);
      for (const p of run) {
        if (p.id === best.id) continue;
        const f = out.get(p.id)!;
        f.flags.push("similar");
        f.similarTo = best.id;
      }
    }
    run = [];
  };
  for (const p of checked) {
    const last = run[run.length - 1];
    if (last && hamming(last.check.dhash, p.check.dhash) > SIMILAR_BITS) closeRun();
    run.push(p);
  }
  closeRun();
  return out;
}
