/**
 * Layouts: the shapes a roll can pour into.
 *
 * One roll, many outputs. A layout is data, exactly like a look: a page size, photo windows and a
 * list of things to draw. A strip stacks four windows on tall paper; a carousel is a single square
 * page drawn once per photo; a contact sheet is a grid. Adding a layout means adding an entry to
 * layoutTemplates.ts, never new drawing code here.
 */

export type Paint = string | { grad: "v" | "h"; stops: [number, string][] };

export interface Slot {
  x: number; y: number; w: number; h: number; r?: number;
  /** Tilt in degrees, about the slot's centre. */
  rot?: number;
  /** A soft drop shadow under the photo, as a blur radius in layout units. */
  shadow?: number;
  /** A paper border around the photo, the way a print has one. `foot` makes the bottom edge deeper. */
  mat?: { w: number; color: string; foot?: number };
  /**
   * One photo stretched across the whole carousel: each page shows its own vertical slice, so the
   * picture runs on unbroken as the reader swipes. The photo is taken from the first page, and the
   * slice is chosen by which page is being drawn.
   */
  pan?: boolean;
}

export type Decor =
  | { k: "rect"; x: number; y: number; w: number; h: number; r?: number; fill?: Paint; stroke?: string; lw?: number; dash?: number[] }
  | { k: "text"; x: number; y: number; t: string; size: number; color: string; font?: "serif" | "sans" | "mono" | "slab"; weight?: string; align?: "left" | "center" | "right"; track?: number; caps?: boolean; italic?: boolean; wrap?: number; lh?: number; up?: boolean }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; color: string; lw?: number; dash?: number[] }
  | { k: "stars"; x: number; y: number; n: number; size: number; gap: number; color: string; align?: "left" | "center" }
  | { k: "barcode"; x: number; y: number; w: number; h: number; color: string; seed?: number }
  | { k: "perf"; side: "left" | "right" | "both"; r: number; gap: number; color: string; from?: number; to?: number }
  | { k: "sprocket"; side: "left" | "right" | "both"; color: string; w?: number; h?: number; gap?: number }
  | { k: "checker"; x: number; y: number; w: number; h: number; cell: number; a: string; b: string }
  | { k: "scallop"; side: "left" | "right"; r: number; color: string }
  | { k: "notch"; y: number; r: number; color: string }
  /** Film grain over everything drawn so far. Tiled from one small noise square, so it costs almost nothing. */
  | { k: "grain"; amount: number; seed?: number; cell?: number }
  /** Darkens the corners the way a lens does. */
  | { k: "vignette"; strength: number; soft?: number }
  /** A flat colour over the page: the warm, faded cast of an old print. */
  /** "saturation" with a grey colour drains the colour out of everything drawn so far. */
  | { k: "wash"; color: string; alpha: number; mode?: "multiply" | "screen" | "overlay" | "soft-light" | "source-over" | "saturation" | "color" | "luminosity" | "hue" }
  /** A counter like 3/5, drawn as a small pill. Carousels use it; strips normally do not. */
  /** The page's own photo, blurred to fill the whole page and dimmed, as a backdrop for the sharp one on top. */
  | { k: "backdrop"; dim?: number; tint?: string }
  /** A dot screen over a rectangle, the way newsprint reproduces a photograph. */
  | { k: "halftone"; x: number; y: number; w: number; h: number; cell?: number; color?: string; amount?: number }
  | { k: "pill"; x: number; y: number; t: string; size: number; fg: string; bg: string; pad?: number; align?: "left" | "center" | "right" };

export interface LayoutField { key: string; label: string; def: string; max: number }

export type LayoutKind = "strip" | "card" | "carousel" | "sheet" | "print";

export interface Layout {
  id: string;
  name: string;
  family: string;
  blurb: string;
  /** strip and card render once. carousel renders the page once per photo. sheet is one page of many windows. print is paper-sized, exported at 300 DPI. */
  kind: LayoutKind;
  w: number;
  h: number;
  bg: Paint;
  /** Photo windows on one page. A carousel normally has exactly one. */
  slots: Slot[];
  under: Decor[];
  over?: Decor[];
  fields?: LayoutField[];
  /** Paper colour for the gap between a printed pair. */
  cut?: string;
  /** How many pages a carousel may hold. */
  slides?: { min: number; max: number };
  /** Multiplier applied when exporting. A 600px strip doubles; a 1080px carousel is already full size. */
  exportScale?: number;
  /** Shown under the layout's name in the picker. */
  note?: string;
  /** Print only: the paper size, for the picker and the file name. */
  paper?: string;
}

/** Older name, kept so nothing that still says "strip" has to change at once. */
export type StripTemplate = Layout;
export type StripField = LayoutField;

const FONTS = {
  serif: 'Georgia, "Times New Roman", Times, serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  slab: '"Courier New", ui-monospace, monospace',
};

export const isCarousel = (l: Layout) => l.kind === "carousel";
/** How many photos this layout wants, given how many pages a carousel is set to. */
export const capacityOf = (l: Layout, slides = 1) => (isCarousel(l) ? slides : l.slots.length);

/* ---------- drawing ---------- */

function paint(g: CanvasRenderingContext2D, p: Paint, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (typeof p === "string") return p;
  const grad = p.grad === "v" ? g.createLinearGradient(x, y, x, y + h) : g.createLinearGradient(x, y, x + w, y);
  for (const [o, c] of p.stops) grad.addColorStop(o, c);
  return grad;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 0) {
  g.beginPath();
  if (r <= 0) g.rect(x, y, w, h);
  else g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 ? r * 0.44 : r;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}

/** Deterministic pseudo-random, so a barcode or a grain field looks the same every time it is drawn. */
const rnd = (s: number) => { let x = s * 9301 + 49297; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); };

/**
 * One square of noise, reused for every grain call with the same settings. Per-pixel noise over a
 * full 1080x1350 page costs about a tenth of a second; a tiled 128px square costs nothing.
 */
const grainCache = new Map<string, HTMLCanvasElement>();
function grainTile(amount: number, seed: number, cell: number): HTMLCanvasElement | null {
  const key = `${amount}|${seed}|${cell}`;
  const hit = grainCache.get(key);
  if (hit) return hit;
  try {
    const c = document.createElement("canvas");
    c.width = cell; c.height = cell;
    const g = c.getContext("2d");
    if (!g) return null;
    const img = g.createImageData(cell, cell);
    const r = rnd(seed);
    const a = Math.round(Math.max(0, Math.min(1, amount)) * 255);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.round(r() * 90);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = a;
    }
    g.putImageData(img, 0, 0);
    if (grainCache.size > 12) grainCache.clear();
    grainCache.set(key, c);
    return c;
  } catch { return null; }
}

/** Splits text onto as many lines as it needs, so a caption someone typed cannot run off the page. */
function lines(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  if (!max) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width > max && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

function drawDecor(g: CanvasRenderingContext2D, d: Decor, t: Layout, vals: Record<string, string>) {
  switch (d.k) {
    case "backdrop": break; // drawn by the page loop, which has the photo
    case "rect": {
      roundRect(g, d.x, d.y, d.w, d.h, d.r);
      if (d.fill) { g.fillStyle = paint(g, d.fill, d.x, d.y, d.w, d.h); g.fill(); }
      if (d.stroke) { g.strokeStyle = d.stroke; g.lineWidth = d.lw ?? 2; g.setLineDash(d.dash ?? []); g.stroke(); g.setLineDash([]); }
      break;
    }
    case "text": {
      const txt = subst(d.t, vals);
      if (!txt) break;
      g.fillStyle = d.color;
      g.font = `${d.italic ? "italic " : ""}${d.weight ?? "400"} ${d.size}px ${FONTS[d.font ?? "sans"]}`;
      g.textAlign = d.align ?? "left";
      g.textBaseline = "alphabetic";
      try { g.letterSpacing = `${d.track ?? 0}px`; } catch { /* older engines ignore tracking */ }
      const body = d.caps ? txt.toUpperCase() : txt;
      const rows = d.wrap ? lines(g, body, d.wrap) : [body];
      const lh = d.lh ?? Math.round(d.size * 1.25);
      // `up` stacks the lines upward from y, so a caption that runs to two lines grows away from
      // whatever sits below it instead of colliding with it.
      rows.forEach((row, i) => g.fillText(row, d.x, d.y + (d.up ? i - rows.length + 1 : i) * lh));
      try { g.letterSpacing = "0px"; } catch { /* ignore */ }
      break;
    }
    case "line": {
      g.strokeStyle = d.color; g.lineWidth = d.lw ?? 2; g.setLineDash(d.dash ?? []);
      g.beginPath(); g.moveTo(d.x1, d.y1); g.lineTo(d.x2, d.y2); g.stroke(); g.setLineDash([]);
      break;
    }
    case "stars": {
      g.fillStyle = d.color;
      const total = d.n * d.size * 2 + (d.n - 1) * d.gap;
      let x = d.align === "center" ? d.x - total / 2 + d.size : d.x + d.size;
      for (let i = 0; i < d.n; i++) { star(g, x, d.y, d.size); g.fill(); x += d.size * 2 + d.gap; }
      break;
    }
    case "barcode": {
      const r = rnd(d.seed ?? 7);
      g.fillStyle = d.color;
      let x = d.x;
      while (x < d.x + d.w - 2) {
        const bw = 1 + Math.floor(r() * 4);
        if (r() > 0.38) g.fillRect(x, d.y, bw, d.h);
        x += bw + 1 + Math.floor(r() * 3);
      }
      break;
    }
    case "perf": {
      g.fillStyle = d.color;
      const from = d.from ?? 0, to = d.to ?? t.h;
      for (let y = from + d.gap / 2; y < to; y += d.gap) {
        if (d.side !== "right") { g.beginPath(); g.arc(0, y, d.r, 0, Math.PI * 2); g.fill(); }
        if (d.side !== "left") { g.beginPath(); g.arc(t.w, y, d.r, 0, Math.PI * 2); g.fill(); }
      }
      break;
    }
    case "sprocket": {
      const w = d.w ?? 16, h = d.h ?? 22, gap = d.gap ?? 20, inset = 10;
      g.fillStyle = d.color;
      for (let y = gap; y < t.h - h; y += h + gap) {
        if (d.side !== "right") { roundRect(g, inset, y, w, h, 4); g.fill(); }
        if (d.side !== "left") { roundRect(g, t.w - inset - w, y, w, h, 4); g.fill(); }
      }
      break;
    }
    case "halftone": {
      // Reads the pixels already drawn and lays a dot over each cell, sized by how dark that cell
      // is — the way a newspaper press turns a continuous tone into ink dots.
      const cell = d.cell ?? 9;
      const amount = d.amount ?? 1;
      const x0 = Math.max(0, Math.round(d.x)), y0 = Math.max(0, Math.round(d.y));
      const w = Math.round(d.w), h = Math.round(d.h);
      let data: ImageData;
      try { data = g.getImageData(x0, y0, w, h); } catch { break; } // a tainted canvas: skip rather than throw
      g.save();
      roundRect(g, d.x, d.y, d.w, d.h); g.clip();
      g.globalAlpha = amount;
      g.fillStyle = d.color ?? "#15130F";
      // Paper first, so the dots sit on white rather than over the photo they replace.
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = amount;
      g.fillStyle = "#EDE8DC";
      g.fillRect(d.x, d.y, d.w, d.h);
      g.fillStyle = d.color ?? "#15130F";
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const i = ((y + (cell >> 1)) * w + (x + (cell >> 1))) * 4;
          if (i + 2 >= data.data.length) continue;
          const lum = (data.data[i] * 0.3 + data.data[i + 1] * 0.59 + data.data[i + 2] * 0.11) / 255;
          const r = (cell / 2) * Math.sqrt(1 - lum) * 1.12;
          if (r < 0.35) continue;
          g.beginPath();
          g.arc(x0 + x + cell / 2, y0 + y + cell / 2, Math.min(r, cell * 0.72), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
      break;
    }
    case "checker": {
      const cols = Math.ceil(d.w / d.cell), rows = Math.ceil(d.h / d.cell);
      g.save(); roundRect(g, d.x, d.y, d.w, d.h); g.clip();
      for (let r2 = 0; r2 < rows; r2++) for (let c = 0; c < cols; c++) {
        g.fillStyle = (r2 + c) % 2 ? d.b : d.a;
        g.fillRect(d.x + c * d.cell, d.y + r2 * d.cell, d.cell, d.cell);
      }
      g.restore();
      break;
    }
    case "scallop": {
      g.fillStyle = d.color;
      const x = d.side === "left" ? 0 : t.w;
      for (let y = 0; y <= t.h; y += d.r * 2.05) { g.beginPath(); g.arc(x, y, d.r, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case "notch": {
      g.fillStyle = d.color;
      g.beginPath(); g.arc(0, d.y, d.r, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(t.w, d.y, d.r, 0, Math.PI * 2); g.fill();
      break;
    }
    case "grain": {
      const tile = grainTile(d.amount, d.seed ?? 3, d.cell ?? 128);
      if (!tile) break;
      const pat = g.createPattern(tile, "repeat");
      if (!pat) break;
      g.save();
      g.globalCompositeOperation = "overlay";
      g.fillStyle = pat;
      g.fillRect(0, 0, t.w, t.h);
      g.restore();
      break;
    }
    case "vignette": {
      const cx = t.w / 2, cy = t.h / 2;
      const r = Math.hypot(cx, cy);
      const grad = g.createRadialGradient(cx, cy, r * (d.soft ?? 0.55), cx, cy, r);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${Math.max(0, Math.min(1, d.strength))})`);
      g.save(); g.fillStyle = grad; g.fillRect(0, 0, t.w, t.h); g.restore();
      break;
    }
    case "wash": {
      g.save();
      g.globalCompositeOperation = d.mode ?? "soft-light";
      g.globalAlpha = Math.max(0, Math.min(1, d.alpha));
      g.fillStyle = d.color;
      g.fillRect(0, 0, t.w, t.h);
      g.restore();
      break;
    }
    case "pill": {
      const txt = subst(d.t, vals);
      if (!txt) break;
      g.font = `600 ${d.size}px ${FONTS.mono}`;
      const pad = d.pad ?? Math.round(d.size * 0.8);
      const tw = g.measureText(txt).width;
      const w = tw + pad * 2, h = d.size + pad;
      const x = d.align === "right" ? d.x - w : d.align === "center" ? d.x - w / 2 : d.x;
      roundRect(g, x, d.y, w, h, h / 2);
      g.fillStyle = d.bg; g.fill();
      g.fillStyle = d.fg; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(txt, x + w / 2, d.y + h / 2 + 1);
      g.textBaseline = "alphabetic";
      break;
    }
  }
}

function subst(s: string, vals: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? "");
}

/** Draws a source image into a slot, cropped to fill like CSS object-fit: cover. */
/**
 * The photo as a soft, out-of-focus fill for the whole page. Shrinking it to a thumbnail and
 * scaling it back up in two steps blurs it on every browser (canvas blur filters are not
 * available everywhere) and costs almost nothing.
 */
function drawBackdrop(g: CanvasRenderingContext2D, t: Layout, p: LayoutPhoto | null | undefined, d: { dim?: number; tint?: string }) {
  if (!p) return;
  const step = (w: number, h: number, src: CanvasImageSource, sw: number, sh: number) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d")!; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    const k = Math.max(w / sw, h / sh);
    x.drawImage(src, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
    return c;
  };
  const tiny = step(Math.round(t.w / 60), Math.round(t.h / 60), p.src, p.w, p.h);
  const mid = step(Math.round(t.w / 12), Math.round(t.h / 12), tiny, tiny.width, tiny.height);
  g.save();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  // Drawn a little oversize so the soft edges of the upscale fall outside the page.
  g.drawImage(mid, -t.w * 0.06, -t.h * 0.06, t.w * 1.12, t.h * 1.12);
  if (d.tint) { g.fillStyle = d.tint; g.fillRect(0, 0, t.w, t.h); }
  g.fillStyle = `rgba(0,0,0,${d.dim ?? 0.35})`; g.fillRect(0, 0, t.w, t.h);
  g.restore();
}

function cover(g: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, s: Slot) {
  const k = Math.max(s.w / iw, s.h / ih);
  const w = iw * k, h = ih * k;
  g.save();
  roundRect(g, s.x, s.y, s.w, s.h, s.r); g.clip();
  g.drawImage(img, s.x + (s.w - w) / 2, s.y + (s.h - h) / 2, w, h);
  g.restore();
}

/**
 * One slice of a panorama. The photo is scaled so its height fills the slot and its width covers all
 * `total` pages laid side by side, then the window for `index` is drawn. Scaling to the full run
 * rather than to one page is what makes the seam disappear.
 */
function panSlice(g: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, s: Slot, index: number, total: number) {
  const pages = Math.max(1, total);
  const runW = s.w * pages;
  const k = Math.max(runW / iw, s.h / ih);
  const w = iw * k, h = ih * k;
  // Where this page's window starts inside the whole run, with any spare width shared at the ends.
  const left = (runW - w) / 2 + (index - 1) * -s.w;
  g.save();
  roundRect(g, s.x, s.y, s.w, s.h, s.r); g.clip();
  g.drawImage(img, s.x + left, s.y + (s.h - h) / 2, w, h);
  g.restore();
}

export interface LayoutPhoto { src: CanvasImageSource; w: number; h: number }
export type StripPhoto = LayoutPhoto;

export interface RenderOpts {
  template: Layout;
  photos: (LayoutPhoto | null)[];
  values?: Record<string, string>;
  /** 1 draws at the layout's own size; 2 doubles it for printing. */
  scale?: number;
  /** Draw the page twice side by side, the way a booth prints a pair to cut apart. */
  pair?: boolean;
  /** Shown where a slot has no photo yet. */
  placeholder?: boolean;
  /** Carousel only: which page this is, counted from 1, and how many there are. */
  slide?: { index: number; total: number; caption?: string };
  /** A small credit, usually "@handle", set up the right-hand edge like a photographer's mark on a film rebate. */
  sign?: string;
}
export type RenderStripOpts = RenderOpts;

export function layoutSize(t: Layout, scale = 1, pair = false) {
  const gap = pair ? Math.round(t.w * 0.05) : 0;
  return { w: Math.round((pair ? t.w * 2 + gap : t.w) * scale), h: Math.round(t.h * scale), gap: Math.round(gap * scale) };
}
export const stripSize = layoutSize;

/**
 * The credit sits inside the photo, bottom-left of the last frame, like a watermark. Every layout
 * has that spot and none of them puts its own text there (looks stamp their date bottom-right).
 * A sheet of separate stickers gets it on each one. Ink is chosen from what is underneath.
 * Drawn in layout units; the caller has already applied the scale.
 */
function drawSign(g: CanvasRenderingContext2D, t: Layout, text: string) {
  const label = text.slice(0, 28);
  const targets = t.kind === "print" && t.slots.length > 1 ? t.slots : t.slots.slice(-1);
  for (const sl of targets) {
    const round = (sl.r ?? 0) > sl.w * 0.3;
    let size = Math.max(7, Math.min(sl.w, sl.h) * 0.05);
    g.save();
    g.font = `600 ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    // Never wider than 60% of the frame.
    const w0 = g.measureText(label).width;
    if (w0 > sl.w * 0.6) { size *= (sl.w * 0.6) / w0; g.font = `600 ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`; }
    const x = round ? sl.x + sl.w / 2 : sl.x + size * 0.9;
    const y = round ? sl.y + sl.h * 0.84 : sl.y + sl.h - size * 1.1;
    let dark = false;
    try {
      const m = g.getTransform();
      const px = g.getImageData(Math.max(0, Math.round(m.a * (round ? x : x + size) + m.e)), Math.max(0, Math.round(m.d * y + m.f) - 2), 6, 4).data;
      let lum = 0; for (let i = 0; i < px.length; i += 4) lum += px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
      dark = lum / (px.length / 4) > 165;
    } catch { /* unreadable canvas: keep light ink */ }
    g.textAlign = round ? "center" : "left"; g.textBaseline = "alphabetic";
    g.fillStyle = dark ? "rgba(20,16,12,.7)" : "rgba(255,255,255,.88)";
    g.shadowColor = dark ? "rgba(255,255,255,.35)" : "rgba(0,0,0,.55)"; g.shadowBlur = size * 0.35;
    g.fillText(label, x, y);
    g.restore();
  }
}

export function renderLayout(canvas: HTMLCanvasElement, o: RenderOpts) {
  const t = o.template, scale = o.scale ?? 1;
  const size = layoutSize(t, scale, o.pair);
  canvas.width = size.w; canvas.height = size.h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = t.cut ?? "#ffffff";
  g.fillRect(0, 0, size.w, size.h);

  const now = new Date();
  // Field defaults first, then what the person typed, then the page's own numbers: a per-page
  // caption must win over the layout's empty default, never the other way round.
  const vals: Record<string, string> = {
    date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    ...Object.fromEntries((t.fields ?? []).map((f) => [f.key, f.def])),
    ...(o.values ?? {}),
    index: String(o.slide?.index ?? 1),
    // Zero-padded, for layouts that set the page number as a design element: 01, 02 …
    index2: String(o.slide?.index ?? 1).padStart(2, "0"),
    total2: String(o.slide?.total ?? 1).padStart(2, "0"),
    total: String(o.slide?.total ?? 1),
    ...(o.slide?.caption !== undefined ? { caption: o.slide.caption } : {}),
  };

  const once = (dx: number) => {
    g.save();
    g.translate(dx, 0);
    g.scale(scale, scale);
    g.save(); roundRect(g, 0, 0, t.w, t.h); g.clip();
    g.fillStyle = paint(g, t.bg, 0, 0, t.w, t.h);
    g.fillRect(0, 0, t.w, t.h);
    for (const d of t.under) { if (d.k === "backdrop") drawBackdrop(g, t, o.photos[0], d); else drawDecor(g, d, t, vals); }
    t.slots.forEach((s, i) => {
      const p = o.photos[i];
      g.save();
      if (s.rot) { g.translate(s.x + s.w / 2, s.y + s.h / 2); g.rotate((s.rot * Math.PI) / 180); g.translate(-(s.x + s.w / 2), -(s.y + s.h / 2)); }
      if (s.mat || s.shadow) {
        const m = s.mat?.w ?? 0, foot = s.mat?.foot ?? m;
        g.save();
        if (s.shadow) { const k = g.getTransform().a; g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = s.shadow * k; g.shadowOffsetY = s.shadow * 0.4 * k; }
        roundRect(g, s.x - m, s.y - m, s.w + m * 2, s.h + m + foot, s.mat ? Math.min(6, m) : s.r);
        g.fillStyle = s.mat?.color ?? "#000000"; g.fill();
        g.restore();
      }
      // A panorama slot always draws the carousel's first photo, sliced by which page this is.
      const panned = s.pan ? o.photos[0] : null;
      if (s.pan && panned) panSlice(g, panned.src, panned.w, panned.h, s, o.slide?.index ?? 1, o.slide?.total ?? 1);
      else if (p) cover(g, p.src, p.w, p.h, s);
      else if (o.placeholder) {
        roundRect(g, s.x, s.y, s.w, s.h, s.r);
        g.fillStyle = "rgba(0,0,0,.30)"; g.fill();
        g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; g.setLineDash([9, 9]); g.stroke(); g.setLineDash([]);
        g.fillStyle = "rgba(255,255,255,.75)";
        g.font = `600 ${Math.round(s.h * 0.16)}px ${FONTS.sans}`;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(i + 1), s.x + s.w / 2, s.y + s.h / 2);
        g.textBaseline = "alphabetic";
      }
      g.restore();
    });
    for (const d of t.over ?? []) drawDecor(g, d, t, vals);
    if (o.sign) drawSign(g, t, o.sign);
    g.restore();
    g.restore();
  };

  once(0);
  if (o.pair) once((t.w * scale) + size.gap);
}
export const renderStrip = renderLayout;

export function layoutToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.94): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not build that page"))), type, quality));
}
export const stripToBlob = layoutToBlob;
