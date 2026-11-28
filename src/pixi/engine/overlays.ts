import type { OverlaySpec, StampStyle } from "./types";

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Replace date tokens in a string. Tokens: YYYY YY MM DD HH hh mm ss AMPM DOW. */
export function formatDate(fmt: string, d: Date): string {
  const h12 = d.getHours() % 12 || 12;
  return fmt.replace(/YYYY|YY|MM|DD|HH|hh|mm|ss|AMPM|DOW/g, (t) => {
    switch (t) {
      case "YYYY":
        return String(d.getFullYear());
      case "YY":
        return pad(d.getFullYear() % 100);
      case "MM":
        return pad(d.getMonth() + 1);
      case "DD":
        return pad(d.getDate());
      case "HH":
        return pad(d.getHours());
      case "hh":
        return pad(h12);
      case "mm":
        return pad(d.getMinutes());
      case "ss":
        return pad(d.getSeconds());
      case "AMPM":
        return d.getHours() >= 12 ? "PM" : "AM";
      default:
        return DOW[d.getDay()];
    }
  });
}

// --- 7-segment ---------------------------------------------------------------------------
const SEG: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  "/": "g",
};

function seg7Width(text: string, h: number) {
  return text.length * h * 0.78;
}

function drawSeg7(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, h: number) {
  const w = h * 0.55;
  const t = h * 0.13;
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, -0.1, 1, h * 0.05, 0);
  let cx = 0;
  for (const ch of text) {
    const segs = SEG[ch];
    if (segs) {
      const r: Record<string, [number, number, number, number]> = {
        a: [t * 0.6, 0, w - t * 1.2, t],
        g: [t * 0.6, h / 2 - t / 2, w - t * 1.2, t],
        d: [t * 0.6, h - t, w - t * 1.2, t],
        f: [0, t * 0.6, t, h / 2 - t * 0.9],
        b: [w - t, t * 0.6, t, h / 2 - t * 0.9],
        e: [0, h / 2 + t * 0.3, t, h / 2 - t * 0.9],
        c: [w - t, h / 2 + t * 0.3, t, h / 2 - t * 0.9],
      };
      for (const s of segs) {
        const [rx, ry, rw, rh] = r[s];
        ctx.fillRect(cx + rx, ry, rw, rh);
      }
    } else if (ch === "'") {
      ctx.fillRect(cx + w * 0.4, 0, t, h * 0.28);
    } else if (ch === ":") {
      ctx.fillRect(cx + w * 0.4, h * 0.28, t, t);
      ctx.fillRect(cx + w * 0.4, h * 0.64, t, t);
    } else if (ch === ".") {
      ctx.fillRect(cx + w * 0.4, h - t, t, t);
    }
    cx += h * 0.78;
  }
  ctx.restore();
}

// --- 5x7 dot matrix ----------------------------------------------------------------------
const DOT: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ":": ["00000", "00100", "00000", "00000", "00000", "00100", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
};

function dotWidth(text: string, h: number) {
  const cell = h / 7;
  return text.length * cell * 6.4;
}

function drawDot(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, h: number) {
  const cell = h / 7;
  let cx = 0;
  for (const ch of text) {
    const g = DOT[ch];
    if (g) {
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 5; c++)
          if (g[r][c] === "1") {
            ctx.beginPath();
            ctx.arc(x + cx + c * cell + cell / 2, y + r * cell + cell / 2, cell * 0.42, 0, Math.PI * 2);
            ctx.fill();
          }
    }
    cx += cell * 6.4;
  }
}

// --- text styles -------------------------------------------------------------------------
function textFont(style: StampStyle, h: number) {
  switch (style) {
    case "mono":
      return `600 ${h}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    case "vcr":
      return `700 ${h}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    default:
      return `800 ${h}px ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif`;
  }
}

function measure(ctx: CanvasRenderingContext2D, style: StampStyle, text: string, h: number) {
  if (style === "seg7") return seg7Width(text, h);
  if (style === "dot") return dotWidth(text, h);
  ctx.font = textFont(style, h);
  return ctx.measureText(text).width;
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  o: Extract<OverlaySpec, { kind: "stamp" }>,
  w: number,
  hgt: number,
  date: Date,
) {
  const text = formatDate(o.format, date);
  const th = o.size * hgt;
  const tw = measure(ctx, o.style, text, th);
  const align = o.align ?? "right";
  const ox = align === "left" ? 0 : align === "center" ? -tw / 2 : -tw;
  ctx.save();
  ctx.translate(o.x * w, o.y * hgt);
  if (o.rotate === 90) ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = o.color;
  ctx.shadowColor = o.color;
  ctx.shadowBlur = (o.glow ?? 0) * th;
  if (o.style === "seg7") drawSeg7(ctx, text, ox, -th / 2, th);
  else if (o.style === "dot") drawDot(ctx, text, ox, -th / 2, th);
  else {
    ctx.font = textFont(o.style, th);
    ctx.textBaseline = "middle";
    if (o.style === "vcr") {
      ctx.shadowBlur = 0;
      ctx.lineWidth = th * 0.16;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(text, ox, 0);
    }
    ctx.fillText(text, ox, 0);
  }
  ctx.restore();
}

function drawOsd(
  ctx: CanvasRenderingContext2D,
  o: Extract<OverlaySpec, { kind: "osd" }>,
  w: number,
  hgt: number,
  date: Date,
) {
  const th = o.size * hgt;
  ctx.save();
  ctx.font = textFont("vcr", th);
  ctx.textBaseline = "middle";
  for (const l of o.lines) {
    const text = formatDate(l.text, date);
    ctx.textAlign = l.align ?? "left";
    if (o.outline !== false) {
      ctx.lineWidth = th * 0.18;
      ctx.strokeStyle = "rgba(0,0,0,0.9)";
      ctx.lineJoin = "round";
      ctx.strokeText(text, l.x * w, l.y * hgt);
    }
    ctx.fillStyle = o.color;
    ctx.fillText(text, l.x * w, l.y * hgt);
  }
  ctx.restore();
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  o: Extract<OverlaySpec, { kind: "hud" }>,
  w: number,
  h: number,
  date: Date,
) {
  const fs = Math.max(12, Math.round(h * 0.026));
  const m = w * 0.045;
  ctx.save();
  ctx.font = `600 ${fs}px ui-sans-serif, system-ui, Arial, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const txt = (s: string, x: number, y: number, align: CanvasTextAlign = "left") => {
    ctx.textAlign = align;
    ctx.lineWidth = fs * 0.22;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = o.color;
    ctx.fillText(s, x, y);
  };
  // battery
  const bw = fs * 1.7;
  const bh = fs * 0.85;
  const by = m * 0.9;
  ctx.strokeStyle = o.color;
  ctx.lineWidth = Math.max(1.5, fs * 0.12);
  ctx.strokeRect(m, by, bw, bh);
  ctx.fillStyle = o.color;
  ctx.fillRect(m + bw, by + bh * 0.3, fs * 0.15, bh * 0.4);
  ctx.fillRect(m + 3, by + 3, (bw - 6) * 0.7, bh - 6);
  if (o.variant === "play") {
    txt("101-0101", w - m, by + bh / 2, "right");
    txt("◀ BACK/NEXT", m, h - m * 1.1);
    txt(formatDate("YYYY M/D  hh:mm AMPM", date).replace("M/D", `${date.getMonth() + 1} ${date.getDate()}`), w - m, h - m * 1.1, "right");
  } else {
    txt("10M", w - m, by + bh / 2, "right");
    txt("4:3", w - m - fs * 3.2, by + bh / 2, "right");
    txt("⚡", m, by + bh + fs * 1.6);
    // focus brackets
    const bx = w / 2;
    const byc = h * 0.44;
    const L = w * 0.07;
    const a = L * 0.45;
    ctx.strokeStyle = o.color;
    ctx.lineWidth = Math.max(2, fs * 0.14);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(bx + sx * L, byc + sy * (L - a));
      ctx.lineTo(bx + sx * L, byc + sy * L);
      ctx.lineTo(bx + sx * (L - a), byc + sy * L);
      ctx.stroke();
    }
    txt(formatDate("YYYY MM DD", date), m, h - m * 1.1);
  }
  ctx.restore();
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  o: Extract<OverlaySpec, { kind: "frame" }>,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.fillStyle = o.color;
  if (o.style === "polaroid") {
    const s = w * 0.045;
    ctx.fillRect(0, 0, w, s);
    ctx.fillRect(0, 0, s, h);
    ctx.fillRect(w - s, 0, s, h);
    ctx.fillRect(0, h - h * 0.15, w, h * 0.15);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(s, s, w - 2 * s, h - s - h * 0.15);
  } else if (o.style === "thin") {
    const s = Math.max(4, w * 0.012);
    ctx.fillRect(0, 0, w, s);
    ctx.fillRect(0, h - s, w, s);
    ctx.fillRect(0, 0, s, h);
    ctx.fillRect(w - s, 0, s, h);
  } else if (o.style === "rounded") {
    const r = Math.min(w, h) * 0.06;
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill("evenodd");
  } else {
    const s = Math.max(6, h * 0.035);
    ctx.fillRect(0, 0, w, s);
    ctx.fillRect(0, h - s, w, s);
    ctx.fillStyle = "#e07a2f";
    ctx.font = `600 ${s * 0.7}px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = "middle";
    ctx.fillText("▸ 14      14A", w * 0.08, h - s / 2);
  }
  ctx.restore();
}

export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overlays: OverlaySpec[],
  date: Date,
) {
  ctx.clearRect(0, 0, w, h);
  for (const o of overlays) {
    if (o.kind === "stamp") drawStamp(ctx, o, w, h, date);
    else if (o.kind === "osd") drawOsd(ctx, o, w, h, date);
    else if (o.kind === "hud") drawHud(ctx, o, w, h, date);
    else drawFrame(ctx, o, w, h);
  }
}
