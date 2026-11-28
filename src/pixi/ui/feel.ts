/**
 * How Pixi feels in the hand: haptics and the shutter sound. One place, so every tap, the
 * shutter and the develop all speak the same language, and the Settings switches really
 * turn them off.
 *
 * Haptics go through Capacitor on the phone (real taptic patterns on iOS, the vibrator on
 * Android) and fall back to navigator.vibrate in a browser. The sound is synthesised with
 * Web Audio, so there is no audio file to ship and nothing loads from the network.
 */
import { Haptics, ImpactStyle, NotificationType } from "@/pixi/native/capacitor-haptics";
import { Capacitor } from "@/pixi/native/capacitor-core";

let hapticsOn = true;
let soundOn = true;
export function setFeel(o: { haptics?: boolean; sound?: boolean }) {
  if (o.haptics !== undefined) hapticsOn = o.haptics;
  if (o.sound !== undefined) soundOn = o.sound;
}

const native = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
const vib = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

/** A control answered a finger. */
export function tap(ms = 8) {
  if (!hapticsOn) return;
  if (native()) void Haptics.impact({ style: ms > 10 ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => vib(ms));
  else vib(ms);
}

/** The shutter: a firm press then a lighter release, like a leaf shutter opening and closing. */
export function shutterFeel() {
  if (hapticsOn) {
    if (native()) { void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}); setTimeout(() => void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}), 70); }
    else vib([14, 50, 6]);
  }
  if (soundOn) shutterSound();
}

/** The picture finished coming up. */
export function developedFeel() {
  if (!hapticsOn) return;
  if (native()) void Haptics.notification({ type: NotificationType.Success }).catch(() => vib(12));
  else vib(12);
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

/**
 * Two short filtered noise bursts: the blade opening, then closing 60 ms later. Quiet by design;
 * it sits under the haptic rather than over it.
 */
function shutterSound() {
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  const len = Math.floor(a.sampleRate * 0.05);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const click = (t: number, freq: number, gain: number) => {
    const src = a.createBufferSource(); src.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 1.4;
    const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(bp).connect(g).connect(a.destination);
    src.start(t);
  };
  click(now, 3200, 0.22);
  click(now + 0.062, 2200, 0.14);
}
