// The looks engine's numbers, exported from the PC app's engine
// (worker/tools/export_looks.py) so both make the same edit.
import raw from "./engine-data.json";

export const LIGHTING_GROUPS = ["daylight", "golden", "indoor", "stage", "night"] as const;
export type Group = (typeof LIGHTING_GROUPS)[number];

type Triple = [number, number, number];

export type Look = {
  id: string;
  name: string;
  group: Group;
  description: string;
  exposure: number;
  temperature: number;
  tint: number;
  contrast: number;
  highlights: number;
  shadows: number;
  fade: number;
  saturation: number;
  vibrance: number;
  glow: number;
  glow_radius: number;
  soften: number;
  clarity: number;
  grain: number;
  vignette: number;
  split_shadows: Triple;
  split_highlights: Triple;
  hsl: Record<string, [number, number]>;
  mono: Triple | null;
  keep_cast: number;
};

type EngineData = {
  looks: Look[];
  defaultLook: Record<Group, string>;
  hueBands: Record<string, number>;
  targetMedian: Record<Group, number>;
  maxEv: number;
  maxDarken: Record<Group, number>;
  unsureFamily: number;
  unsureStrength: number;
  styleBonus: number;
  family: Record<Group, string>;
  reasons: Record<Group, string>;
  guardProbability: number;
  model: { mean: number[]; scale: number[]; weights: number[][]; bias: number[] };
};

export const DATA = raw as unknown as EngineData;
export const LOOKS: readonly Look[] = DATA.looks;
export const LOOKS_BY_ID: ReadonlyMap<string, Look> = new Map(LOOKS.map((l) => [l.id, l]));

export function looksFor(group: Group): Look[] {
  return LOOKS.filter((l) => l.group === group);
}

export function getLook(id: string): Look {
  const look = LOOKS_BY_ID.get(id);
  if (!look) throw new Error(`No look called ${id}`);
  return look;
}

export function isGroup(value: unknown): value is Group {
  return typeof value === "string" && (LIGHTING_GROUPS as readonly string[]).includes(value);
}
