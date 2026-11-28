import type { Preset } from "@/pixi/engine/types";
import { blownOut, buttonPhone, dateStamp, flashCompact, nightBlur } from "./digicam";
import { creative, instant, scan35, toyLens, vhs } from "./film";
import { goldenHour } from "./golden";
import { candyBar, flipPhone } from "./phones";
import { lowRes } from "./lowres";
import { crtTv, disposable, fisheye, security, super8, webcam, y2k } from "./more";

export const PRESETS: Preset[] = [
  ...goldenHour,
  ...dateStamp,
  ...blownOut,
  ...nightBlur,
  ...scan35,
  ...instant,
  ...vhs,
  ...toyLens,
  ...flashCompact,
  ...buttonPhone,
  ...candyBar,
  ...flipPhone,
  ...fisheye,
  ...disposable,
  ...crtTv,
  ...security,
  ...webcam,
  ...super8,
  ...y2k,
  ...creative,
  ...lowRes,
];

export const FAMILIES = Array.from(new Set(PRESETS.map((p) => p.family)));

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? null;
