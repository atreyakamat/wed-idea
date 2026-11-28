import type { OverlaySpec } from "@/pixi/engine/types";
import type { CameraDef } from "./cameras";

export type WatermarkId = "off" | "shoton" | "model-date" | "custom" | "pixi";
export const WATERMARKS: { id: WatermarkId; label: string }[] = [
  { id: "off", label: "No mark" },
  { id: "shoton", label: "Shot on" },
  { id: "model-date", label: "Model + date" },
  { id: "custom", label: "My text" },
  { id: "pixi", label: "Pixi mark" },
];

const sans = (format: string, x: number, y: number, size: number, align: "left" | "center" | "right", color = "#ffffff"): OverlaySpec =>
  ({ kind: "stamp", style: "sans", format, color, x, y, size, glow: 0.05, align });

/** Watermarks are CPU overlays, so they stay crisp and sit above the look. Tokens like DD/MM are replaced by the date. */
export function watermarkOverlays(id: WatermarkId, cam: CameraDef, custom: string): OverlaySpec[] {
  const name = `${cam.brand} ${cam.model}`.toUpperCase();
  switch (id) {
    case "shoton": return [sans(`SHOT ON ${name}`, 0.5, 0.972, 0.02, "center")];
    case "model-date": return [sans(`${name}  ·  DD.MM.YYYY`, 0.5, 0.972, 0.019, "center")];
    case "custom": return custom.trim() ? [sans(custom.trim().slice(0, 40), 0.5, 0.972, 0.024, "center")] : [];
    case "pixi": return [sans("Pixi", 0.05, 0.05, 0.03, "left")];
    default: return [];
  }
}
