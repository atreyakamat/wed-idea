import type { GpuLayerKind, LayerSpec, OverlaySpec, Preset } from "@/pixi/engine/types";

export const L = (kind: GpuLayerKind, params: Record<string, number> = {}): LayerSpec => ({
  kind,
  params,
});

export interface PresetInput {
  id: string;
  name: string;
  family: string;
  blurb: string;
  aspect?: number;
  captureSide?: number;
  layers: LayerSpec[];
  overlays?: OverlaySpec[];
}

export const preset = (p: PresetInput): Preset => p;

export const seg7 = (
  color: string,
  x = 0.93,
  y = 0.91,
  size = 0.028,
  format = "'YY MM DD",
): OverlaySpec => ({ kind: "stamp", style: "seg7", format, color, x, y, size, glow: 0.35, align: "right" });

export const osd = (
  color: string,
  lines: { text: string; x: number; y: number; align?: "left" | "right" | "center" }[],
  size = 0.034,
): OverlaySpec => ({ kind: "osd", lines, color, size });
