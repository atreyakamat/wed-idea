/**
 * The profile card: one 1080×1350 image that says who you are and how you shoot. It is the thing
 * people post. Drawn on a canvas so it works offline and exports at full size.
 */
import type { Profile } from "./profile";

export const CARD_W = 1080, CARD_H = 1350;

type Pic = CanvasImageSource & { width: number; height: number };
export interface CardInput {
  profile: Profile;
  avatar: Pic | null;
  photos: Pic[];
  lookNames: string[];
  /** A QR code for the profile link, when there is one. */
  qr: Pic | null;
}

const SANS = `-apple-system, "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif`;
const MONO = `ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
const INK = "#211C17", SOFT = "#7A7066", PAPER = "#F6F1E7", ACCENT = "#C8791B";

function cover(g: CanvasRenderingContext2D, img: Pic, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / img.width, h / img.height);
  g.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k);
}

/** Text that shrinks to fit one line, down to a floor, then gets an ellipsis. */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, size: number, min: number, family = SANS) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > min) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
  let t = text;
  while (g.measureText(t).width > maxW && t.length > 2) t = t.slice(0, -2).trimEnd() + "…";
  g.fillText(t, x, y);
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width <= maxW) cur = next;
    else { if (cur) lines.push(cur); cur = w; if (lines.length === maxLines) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

/** Small fixed tilts so the prints look dropped on a table, the same way every time. */
const TILT = [-0.045, 0.03, -0.02, 0.04, -0.03, 0.025];

export function renderProfileCard(canvas: HTMLCanvasElement, o: CardInput, scale = 1) {
  canvas.width = Math.round(CARD_W * scale); canvas.height = Math.round(CARD_H * scale);
  const g = canvas.getContext("2d")!;
  g.setTransform(scale, 0, 0, scale, 0, 0);
  const { profile: p } = o;

  // Paper.
  g.fillStyle = PAPER; g.fillRect(0, 0, CARD_W, CARD_H);
  const warm = g.createRadialGradient(CARD_W * 0.2, 0, 50, CARD_W * 0.2, 0, 1100);
  warm.addColorStop(0, "rgba(255,214,150,.35)"); warm.addColorStop(1, "rgba(255,214,150,0)");
  g.fillStyle = warm; g.fillRect(0, 0, CARD_W, CARD_H);

  // Who.
  const ax = 80, ay = 84, ar = 84;
  g.save(); g.beginPath(); g.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2); g.clip();
  if (o.avatar) cover(g, o.avatar, ax, ay, ar * 2, ar * 2);
  else {
    g.fillStyle = INK; g.fillRect(ax, ay, ar * 2, ar * 2);
    g.fillStyle = PAPER; g.font = `700 84px ${SANS}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText((p.name.trim()[0] || p.handle[0] || "P").toUpperCase(), ax + ar, ay + ar + 4);
  }
  g.restore();
  g.lineWidth = 5; g.strokeStyle = "#fff"; g.beginPath(); g.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2); g.stroke();

  g.textAlign = "left"; g.textBaseline = "alphabetic";
  const tx = ax + ar * 2 + 36, tw = CARD_W - tx - 80;
  g.fillStyle = INK;
  fitText(g, p.name.trim() || (p.handle ? `@${p.handle}` : "Your name"), tx, ay + 76, tw, 700, 68, 40);
  if (p.handle && p.name.trim()) { g.fillStyle = ACCENT; fitText(g, `@${p.handle}`, tx, ay + 130, tw, 500, 36, 26, MONO); }
  if (p.bio.trim()) {
    g.fillStyle = SOFT; g.font = `400 34px ${SANS}`;
    wrap(g, p.bio.trim(), CARD_W - 160, 2).forEach((line, i) => g.fillText(line, 80, ay + ar * 2 + 70 + i * 46));
  }

  // The prints. One to six, laid out so any count looks intended.
  const n = Math.min(o.photos.length, 6);
  const top = p.bio.trim() ? 400 : 330, bottom = 1090;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.max(1, Math.ceil(n / cols));
  const gap = 34, areaW = CARD_W - 160, areaH = bottom - top;
  const cellW = (areaW - gap * (cols - 1)) / cols, cellH = (areaH - gap * (rows - 1)) / rows;
  // A print is a photo with a border, thicker at the bottom; fit it inside its cell.
  const pw = Math.min(cellW, (cellH / 1.16)), ph = pw * 1.16;
  for (let i = 0; i < Math.max(n, 1); i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols || 1 : cols;
    const rowW = inRow * pw + (inRow - 1) * gap;
    const x = (CARD_W - rowW) / 2 + c * (pw + gap), y = top + r * (cellH + gap) + (cellH - ph) / 2;
    g.save();
    g.translate(x + pw / 2, y + ph / 2); g.rotate(TILT[i % TILT.length]); g.translate(-pw / 2, -ph / 2);
    g.shadowColor = "rgba(40,25,10,.28)"; g.shadowBlur = 30; g.shadowOffsetY = 14;
    g.fillStyle = "#FFFDF8"; g.fillRect(0, 0, pw, ph);
    g.shadowColor = "transparent";
    const b = pw * 0.055, win = pw - b * 2;
    g.fillStyle = "#E6DFD2"; g.fillRect(b, b, win, win);
    if (o.photos[i]) { g.save(); g.beginPath(); g.rect(b, b, win, win); g.clip(); cover(g, o.photos[i], b, b, win, win); g.restore(); }
    else { g.fillStyle = "#B9B0A2"; g.font = `500 ${Math.round(pw * 0.07)}px ${SANS}`; g.textAlign = "center"; g.fillText("Add photos from your roll", pw / 2, b + win / 2); g.textAlign = "left"; }
    g.restore();
  }

  // How they shoot.
  g.fillStyle = SOFT; g.font = `600 24px ${MONO}`;
  g.fillText("SHOOTS WITH", 80, 1162);
  let cx = 80; const cy = 1186;
  g.font = `600 30px ${SANS}`;
  const names = o.lookNames.length ? o.lookNames.slice(0, 3) : ["Pick your looks"];
  for (const name of names) {
    const w = g.measureText(name).width + 48;
    if (cx + w > CARD_W - (o.qr ? 250 : 80)) break;
    g.fillStyle = o.lookNames.length ? INK : "#CFC6B8"; g.beginPath(); g.roundRect(cx, cy, w, 60, 30); g.fill();
    g.fillStyle = PAPER; g.fillText(name, cx + 24, cy + 41);
    cx += w + 14;
  }

  // Footer: where it came from, and the code that opens the profile.
  g.fillStyle = INK; g.font = `800 40px ${SANS}`; g.fillText("Pixi", 80, 1296);
  g.fillStyle = SOFT; g.font = `400 24px ${SANS}`; g.fillText("Free. On-device. No account.", 168, 1294);
  if (o.qr) {
    const q = 150, qx = CARD_W - 80 - q, qy = CARD_H - 60 - q;
    g.fillStyle = "#fff"; g.beginPath(); g.roundRect(qx - 12, qy - 12, q + 24, q + 24, 16); g.fill();
    g.imageSmoothingEnabled = false; g.drawImage(o.qr, qx, qy, q, q); g.imageSmoothingEnabled = true;
  }
}
