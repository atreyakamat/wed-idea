/**
 * A short clip of a photo developing, the way the DevelopCard shows it after the shutter:
 * an instant-print card on a dark table, the picture coming up from blank over a few seconds.
 * 1080×1350 so it posts straight to a feed or a story. Needs MediaRecorder with canvas capture,
 * which Chrome and the Android WebView have; returns null anywhere it is missing.
 */
export const CLIP_SECONDS = 6;

export function canMakeClip(): boolean {
  if (typeof MediaRecorder === "undefined" || typeof document === "undefined") return false;
  const c = document.createElement("canvas");
  return typeof c.captureStream === "function";
}

const TYPES: [string, string][] = [["video/mp4;codecs=avc1", "mp4"], ["video/mp4", "mp4"], ["video/webm;codecs=vp9", "webm"], ["video/webm", "webm"]];

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export async function makeDevelopClip(photo: Blob, onProgress?: (p: number) => void): Promise<{ blob: Blob; ext: string } | null> {
  if (!canMakeClip()) return null;
  const bmp = await createImageBitmap(photo);
  try {
    const W = 1080, H = 1350, FPS = 30;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext("2d")!;
    const found = TYPES.find(([m]) => MediaRecorder.isTypeSupported(m));
    const stream = canvas.captureStream(FPS);
    const rec = new MediaRecorder(stream, found ? { mimeType: found[0], videoBitsPerSecond: 8_000_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });

    // The card: portrait instant print, picture window with a thick bottom border.
    const cw = 760, ch = 920, cx = (W - cw) / 2, cy = (H - ch) / 2 - 30;
    const pad = 34, win = { x: cx + pad, y: cy + pad, w: cw - pad * 2, h: ch - pad * 2 - 150 };
    const k = Math.max(win.w / bmp.width, win.h / bmp.height);
    const pw = bmp.width * k, ph = bmp.height * k;
    const hasFilter = "filter" in g;

    const frame = (t: number) => {
      // Stage: a dark table with a soft pool of light.
      g.filter = "none";
      g.fillStyle = "#0E0D0C"; g.fillRect(0, 0, W, H);
      const pool = g.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 900);
      pool.addColorStop(0, "rgba(255,240,215,.16)"); pool.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = pool; g.fillRect(0, 0, W, H);

      // The card slides up and settles in the first 0.9 s.
      const enter = ease(t / 0.9);
      const dy = (1 - enter) * 160, rot = (1 - enter) * -0.05;
      g.save();
      g.translate(W / 2, cy + ch / 2 + dy); g.rotate(rot); g.translate(-W / 2, -(cy + ch / 2));
      g.shadowColor = "rgba(0,0,0,.65)"; g.shadowBlur = 60; g.shadowOffsetY = 26;
      g.fillStyle = "#FBF8F2"; roundRect(g, cx, cy, cw, ch, 10); g.fill();
      g.shadowColor = "transparent";
      g.fillStyle = "#EFEAE0"; g.fillRect(win.x, win.y, win.w, win.h);

      // The picture comes up between 0.8 s and 5.0 s.
      const d = ease((t - 0.8) / 4.2);
      g.save();
      g.beginPath(); g.rect(win.x, win.y, win.w, win.h); g.clip();
      g.globalAlpha = 0.12 + 0.88 * d;
      if (hasFilter) {
        const br = 1.95 - 0.95 * d, ct = 0.22 + 0.78 * d, sa = 0.12 + 0.88 * d, se = 0.5 * (1 - d);
        g.filter = `brightness(${br.toFixed(3)}) contrast(${ct.toFixed(3)}) saturate(${sa.toFixed(3)}) sepia(${se.toFixed(3)})`;
      }
      g.drawImage(bmp, win.x + (win.w - pw) / 2, win.y + (win.h - ph) / 2, pw, ph);
      g.filter = "none"; g.globalAlpha = 1;
      g.restore();

      // Small wordmark on the border, fading in at the end.
      g.globalAlpha = ease((t - 4.6) / 0.8);
      g.fillStyle = "#9A9185"; g.font = "600 22px ui-monospace, Menlo, monospace"; g.textAlign = "center";
      g.fillText("PIXI", W / 2, cy + ch - 56);
      g.globalAlpha = 1;
      g.restore();
    };

    frame(0);
    rec.start(200);
    const t0 = performance.now();
    await new Promise<void>((res) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        frame(t);
        onProgress?.(Math.min(1, t / CLIP_SECONDS));
        if (t < CLIP_SECONDS) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await stopped;
    if (!chunks.length) return null;
    return { blob: new Blob(chunks, { type: rec.mimeType || "video/webm" }), ext: found?.[1] ?? "webm" };
  } finally { bmp.close(); }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
