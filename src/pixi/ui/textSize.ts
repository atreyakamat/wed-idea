/**
 * Dynamic Type. On the phone, read the person's system text size and apply it to the root font
 * size, so everything set in rem grows with it while the layout (set in px) holds its shape.
 * The WebView's own text zoom is reset to 100% so text is not scaled twice. Capped at 135%: past
 * that the camera controls no longer fit one screen.
 *
 * In a browser nothing is needed: rem already follows the browser's font-size setting.
 */
import { Capacitor } from "@/pixi/native/capacitor-core";
import { TextZoom } from "@/pixi/native/capacitor-text-zoom";

export async function applySystemTextSize() {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { value } = await TextZoom.getPreferred();
    await TextZoom.set({ value: 1 });
    const k = Math.min(1.35, Math.max(0.85, value || 1));
    document.documentElement.style.fontSize = `${(16 * k).toFixed(2)}px`;
  } catch { /* plugin unavailable: keep the default */ }
}
