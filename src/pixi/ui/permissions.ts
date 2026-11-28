import { Capacitor } from "@/pixi/native/capacitor-core";

export type PermState = "granted" | "denied" | "prompt" | "unknown";

/**
 * What the browser or WebView will currently give us. The Permissions API is the only way to read a
 * state without asking for it, and it is missing or partial on some WebViews, so "unknown" is a real
 * answer rather than a failure — the screen then says "not checked yet" instead of guessing.
 */
async function query(name: "camera" | "microphone" | "geolocation"): Promise<PermState> {
  try {
    const q = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!q?.query) return "unknown";
    const r = await q.query({ name } as unknown as PermissionDescriptor);
    if (r.state === "granted" || r.state === "denied" || r.state === "prompt") return r.state;
    return "unknown";
  } catch { return "unknown"; }
}

export const cameraState = () => query("camera");
export const micState = () => query("microphone");
export const locationState = () => query("geolocation");

/**
 * Asks for one by opening the device briefly and closing it again. There is no way to raise the
 * system prompt without starting a capture, so the track is stopped the moment it arrives.
 */
export async function requestMedia(kind: "camera" | "microphone"): Promise<boolean> {
  try {
    const s = await navigator.mediaDevices.getUserMedia(kind === "camera" ? { video: true } : { audio: true });
    s.getTracks().forEach((t) => t.stop());
    return true;
  } catch { return false; }
}

export interface Fix { lat: number; lon: number }

/**
 * A rough, one-shot fix for tagging a shot with where it was taken. Coarse accuracy and a short
 * cache window: Pixi only ever shows a coordinate, never a street address or a map tile fetched
 * from anywhere, so there is nothing more precise worth asking for.
 */
export async function requestLocation(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(() => resolve(true), () => resolve(false), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 });
  });
}

/** Best-effort fix for the moment a shot is taken. Never blocks the shutter: a timeout just means no tag. */
export function lastFix(): Promise<Fix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (f: Fix | null) => { if (!done) { done = true; resolve(f); } };
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: false, timeout: 1500, maximumAge: 300_000 },
    );
    setTimeout(() => finish(null), 1600);
  });
}

/**
 * Once a permission is denied, only the system settings screen can change it, so Pixi has to send
 * the person there rather than asking again and having nothing happen.
 */
export function canOpenSystemSettings(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/**
 * Opens the phone's settings page for Pixi. Capacitor has no plugin for this, and adding one for a
 * single intent is not worth the weight, so the app shows the path to tap instead when this fails.
 */
export async function openSystemSettings(): Promise<boolean> {
  if (!canOpenSystemSettings()) return false;
  try {
    const { App } = await import("@/pixi/native/capacitor-app");
    // There is no app-settings API in @capacitor/app. Kept as a probe so a future plugin slots in
    // here; until then the UI shows the path, which is why this returns false rather than throwing.
    void App;
    return false;
  } catch { return false; }
}

export const settingsPath = "Settings → Apps → Pixi → Permissions";
