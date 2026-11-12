// Measure → sort the light → fix → pick a look → apply it. A port of the PC
// app's engine (worker/src/cwp_worker/looks/engine.py and lighting.py), so a
// photo edited in the browser matches one edited by the PC app.
import { DATA, getLook, LIGHTING_GROUPS, looksFor, type Group, type Look } from "./data";
import { measure, type Features } from "./features";
import type { Rgb } from "./image";
import { applyLook, exposureAndBalance, tone } from "./render";

export type Lighting = { group: Group; confidence: number; scores: Record<Group, number>; familyConfidence: number };
export type Fix = { ev: number; gains: [number, number, number]; highlights: number; shadows: number };

/** A studio's favourite look per kind of light, learnt from its picks. */
export type StylePrefs = Partial<Record<Group, string>>;

/** How much a studio's favourite look is preferred over the scene's own pick. */
export const STYLE_BONUS = DATA.styleBonus;

// --- Lighting ---------------------------------------------------------------

function featureVector(f: Features): number[] {
  const log = (x: number, floor: number) => Math.log(Math.max(x, floor));
  return [
    f.brightness,
    f.p95,
    log(f.warmth, 0.05),
    log(f.highlight_warmth, 0.05),
    f.dark_share,
    f.saturation,
    Math.min(f.sky_share * 10, 1),
    f.clipped_highlights * 10,
    f.skin_share,
    f.green_share,
    f.contrast,
    log(f.centre_ratio, 0.1),
    f.neon_share,
    f.tint * 10,
    log(f.top_ratio, 0.05),
    f.blue_top,
    f.warm_highlights * 5,
    f.spot_share * 20,
    f.flash_fired ? 1 : 0,
  ];
}

function probabilities(f: Features): Record<Group, number> {
  const { mean, scale, weights, bias } = DATA.model;
  const z = featureVector(f).map((v, i) => (v - mean[i]) / (scale[i] || 1));
  const logits = bias.map((b, k) => b + z.reduce((sum, zi, i) => sum + zi * weights[i][k], 0));
  const top = Math.max(...logits);
  const exp = logits.map((v) => Math.exp(v - top));
  const total = exp.reduce((a, b) => a + b, 0);
  return Object.fromEntries(LIGHTING_GROUPS.map((g, i) => [g, exp[i] / total])) as Record<Group, number>;
}

function guard(f: Features): Group | null {
  if (f.neon_share >= 0.08 && f.dark_share >= 0.35) return "stage";
  if (f.blue_top >= 0.35 && f.brightness >= 0.35 && f.dark_share <= 0.15 && f.warmth < 0.9) return "daylight";
  return null;
}

export function classify(f: Features): Lighting {
  let probs = probabilities(f);
  const target = guard(f);
  const g = DATA.guardProbability;
  if (target && probs[target] < g) {
    const rest = LIGHTING_GROUPS.filter((x) => x !== target).reduce((s, x) => s + probs[x], 0) || 1;
    probs = Object.fromEntries(LIGHTING_GROUPS.map((x) => [x, x === target ? g : (probs[x] / rest) * (1 - g)])) as Record<Group, number>;
  }
  const group = LIGHTING_GROUPS.reduce((best, x) => (probs[x] > probs[best] ? x : best), LIGHTING_GROUPS[0]);
  const family = DATA.family[group];
  const familyConfidence = LIGHTING_GROUPS.filter((x) => DATA.family[x] === family).reduce((s, x) => s + probs[x], 0);
  return { group, confidence: probs[group], scores: probs, familyConfidence };
}

// --- Fix ----------------------------------------------------------------------

export function planFix(f: Features, group: Group, keepCast: number): Fix {
  const target = DATA.targetMedian[group];
  let ev = Math.log2(Math.max(target, 1e-3) ** 2.2 / Math.max(f.median, 1e-3) ** 2.2);
  if (f.p95 > 0.92 && ev > 0) ev *= 0.35;
  ev = Math.max(DATA.maxDarken[group], Math.min(DATA.maxEv, ev * 0.75));

  const cast = Math.min(1, Math.max(0, keepCast));
  const rGain = (1 / Math.max(f.warmth, 0.2)) ** 0.5;
  const bGain = Math.max(f.warmth, 0.2) ** 0.5;
  const gains: [number, number, number] = [1 + (rGain - 1) * (1 - cast), 1 - f.tint * 1.2 * (1 - cast), 1 + (bGain - 1) * (1 - cast)];
  const highlights = -Math.min(0.8, f.clipped_highlights * 12 + Math.max(0, f.p95 - 0.9) * 2);
  const shadows = group === "stage" || group === "night" ? 0 : Math.min(0.5, Math.max(0, 0.25 - f.p05) * 1.2);
  const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
  return { ev: round(ev, 3), gains: gains.map((x) => round(x, 4)) as [number, number, number], highlights: round(highlights, 3), shadows: round(shadows, 3) };
}

export function applyFix(image: Rgb, fix: Fix): Rgb {
  return tone(exposureAndBalance(image, fix.ev, fix.gains), 0, fix.highlights, fix.shadows, 0);
}

// --- Picking a look -----------------------------------------------------------

const around = (value: number, centre: number, width: number) => Math.exp(-(((value - centre) / width) ** 2));
const upTo = (x: number, cap: number) => Math.min(x / cap, 1);

export function scoreLooks(f: Features, group: Group, style: StylePrefs = {}): Record<string, number> {
  const s: Record<string, number> = Object.fromEntries(looksFor(group).map((l) => [l.id, 0]));
  s[DATA.defaultLook[group]] = 0.5;
  if (group === "daylight") {
    s["coastal-blue"] += 3 * upTo(f.sky_share, 0.04) * (1 - upTo(f.green_share, 0.4));
    s["garden-green"] += 1.6 * upTo(f.green_share, 0.35);
    s["bright-airy"] += 0.9 * upTo(f.skin_share, 0.12) * around(f.contrast, 0.55, 0.25);
    s["soft-pastel"] += 0.7 * upTo(f.skin_share, 0.15) * (1 - upTo(f.saturation, 0.45));
  } else if (group === "golden") {
    s["sunset-pop"] += 1.4 * upTo(f.sky_share, 0.03) * upTo(f.saturation, 0.4);
    s["dreamy-bloom"] += 1.2 * upTo(f.clipped_highlights, 0.05) * upTo(f.skin_share, 0.1);
    s["warm-haze"] += 0.9 * around(f.contrast, 0.35, 0.15);
    s["honey-film"] += 0.5 * upTo(f.skin_share, 0.2) * (1 - upTo(f.saturation, 0.5));
  } else if (group === "indoor") {
    s["candlelight"] += 1.4 * upTo(f.dark_share, 0.45) * upTo(f.highlight_warmth, 1.8);
    s["clean-indoor"] += 1.3 * Math.max(0, Math.min((f.warmth - 1.55) / 0.5, 1));
    s["soft-skin"] += 1.4 * Math.max(0, Math.min((f.skin_share - 0.12) / 0.15, 1));
    s["moody-amber"] += 0.7 * upTo(f.dark_share, 0.5) * (1 - upTo(f.skin_share, 0.15));
  } else if (group === "stage") {
    s["neon-night"] += 1.2 * upTo(f.neon_share, 0.15);
    s["club-glow"] += 0.9 * upTo(f.dark_share, 0.6) * upTo(f.neon_share, 0.1);
    s["tamed-colour"] += 1.5 * upTo(f.skin_share, 0.08) * upTo(f.saturation, 0.55);
  } else {
    const flashLike = f.flash_fired ? 1 : Math.min(Math.max(f.centre_ratio - 1.4, 0) / 1.2, 1);
    s["flash-film"] += 1.6 * flashLike * upTo(f.skin_share, 0.06);
    s["dark-rich"] += 0.8 * upTo(f.saturation, 0.45) * (1 - upTo(f.dark_share, 0.7));
  }
  const favourite = style[group];
  if (favourite && favourite in s) s[favourite] += STYLE_BONUS;
  for (const k of Object.keys(s)) s[k] = Math.round(s[k] * 1000) / 1000;
  return s;
}

export type Plan = { features: Features; lighting: Lighting; look: Look; strength: number; scores: Record<string, number> };

/**
 * What the engine would do with a photo: its light and the look it picks.
 * Pass `group` to skip the light model (the PC app already sorted it).
 */
export function plan(image: Rgb, options: { lookId?: string; group?: Group; style?: StylePrefs; flashFired?: boolean } = {}): Plan {
  const features = measure(image, options.flashFired);
  const measured = classify(features);
  const lighting = options.group ? { ...measured, group: options.group, familyConfidence: 1 } : measured;
  const scores = scoreLooks(features, lighting.group, options.style);
  if (options.lookId) return { features, lighting, look: getLook(options.lookId), strength: 1, scores };
  if (!options.style?.[lighting.group] && lighting.familyConfidence < DATA.unsureFamily) {
    return { features, lighting, look: getLook(DATA.defaultLook[lighting.group]), strength: DATA.unsureStrength, scores };
  }
  const best = Object.keys(scores).reduce((a, b) => (scores[b] > scores[a] ? b : a));
  return { features, lighting, look: getLook(best), strength: 1, scores };
}

/** Renders a photo with a look: the automatic fix, then the look. */
export function render(image: Rgb, features: Features, group: Group, look: Look, strength = 1, seed = 0): Rgb {
  return applyLook(applyFix(image, planFix(features, group, look.keep_cast)), look, strength, seed);
}
