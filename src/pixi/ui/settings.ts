import { useEffect, useState } from "react";
import { setFeel } from "./feel";

export interface Settings {
  /** auto: every shot also lands in the phone gallery. manual: shots stay in Pixi until you export. */
  saveMode: "auto" | "manual";
  format: "jpeg" | "png";
  quality: number;
  haptics: boolean;
  /** Watch a photo come up after the shutter, the way an instant print does. */
  develop: boolean;
  /** Export photobooth strips as two copies side by side, the way a real booth prints them. */
  stripPair: boolean;
  /** Cap on how many shots Pixi keeps on the phone. Oldest go first. */
  rollLimit: number;
  /** A quiet shutter click. */
  sound: boolean;
  /** Show the look builder and its tools. Off keeps Pixi to shoot, develop, make. */
  advanced: boolean;
  /** Put the profile's @handle on what Build makes. */
  sign: boolean;
  /** Frame-time meter over the viewfinder, for measuring on a real phone. */
  meter: boolean;
}

export const DEFAULTS: Settings = { saveMode: "auto", format: "jpeg", quality: 0.92, haptics: true, develop: true, stripPair: false, rollLimit: 500, sound: true, advanced: false, meter: false, sign: false };
const KEY = "pixi:settings:v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      saveMode: v.saveMode === "manual" ? "manual" : "auto",
      format: v.format === "png" ? "png" : "jpeg",
      quality: typeof v.quality === "number" && v.quality >= 0.5 && v.quality <= 1 ? v.quality : DEFAULTS.quality,
      haptics: v.haptics !== false,
      develop: v.develop !== false,
      stripPair: v.stripPair === true,
      rollLimit: typeof v.rollLimit === "number" && v.rollLimit >= 50 && v.rollLimit <= 5000 ? v.rollLimit : DEFAULTS.rollLimit,
      sound: v.sound !== false,
      advanced: v.advanced === true,
      meter: v.meter === true,
      sign: v.sign === true,
    };
  } catch { return { ...DEFAULTS }; }
}

export function persistSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is read after mount so hydration matches
  useEffect(() => { setSettings(loadSettings()); setReady(true); }, []);
  useEffect(() => { if (ready) persistSettings(settings); }, [settings, ready]);
  useEffect(() => { setFeel({ haptics: settings.haptics, sound: settings.sound }); }, [settings.haptics, settings.sound]);
  return { settings, setSettings };
}

export const mime = (s: Settings) => (s.format === "png" ? "image/png" : "image/jpeg");
export const ext = (s: Settings) => (s.format === "png" ? "png" : "jpg");
