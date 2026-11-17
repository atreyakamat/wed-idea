// Draws look sheets in the browser, using the same looks engine as the Review
// screen and the PC app, so what the client sees is what the studio chose.
import { getLook, LOOKS } from "@/lib/looks/data";
import { decodeUrl, planPhoto, renderLook, toCanvas } from "@/lib/looks/client";
import { gridPositions } from "./look-sheet";

const PAPER = "#faf7f2";
const INK = "#1b1a17";
const MUTED = "#6b665d";
const GRID_COLS = 5;
const TILE = 300;
const GAP = 24;
const LABEL = 40;

function sheet(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the sheet.");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

function jpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image."))), "image/jpeg", 0.92),
  );
}

/** Every look, each photo labelled with its look's name. */
export async function makeGridSheet(url: string): Promise<Blob> {
  const small = await decodeUrl(url, TILE);
  const plan = await planPhoto(small);
  const tileH = Math.round((TILE * small.height) / small.width);
  const rows = Math.ceil(LOOKS.length / GRID_COLS);
  const cell = tileH + LABEL;
  const { canvas, ctx } = sheet(GRID_COLS * TILE + (GRID_COLS + 1) * GAP, rows * cell + (rows + 1) * GAP);
  const at = gridPositions(LOOKS.length, GRID_COLS, TILE, cell, GAP);
  for (let i = 0; i < LOOKS.length; i++) {
    const look = LOOKS[i];
    const out = await renderLook(small, plan.features, plan.group, look.id, plan.strength, `sheet-${look.id}`);
    const { x, y } = at[i];
    ctx.drawImage(toCanvas(out), x, y, TILE, tileH);
    ctx.fillStyle = INK;
    ctx.font = "500 18px system-ui, sans-serif";
    ctx.fillText(look.name, x, y + tileH + 26, TILE);
  }
  return jpeg(canvas);
}

/** The photo as it was, beside it with the look the studio would give it. */
export async function makeBeforeAfter(url: string): Promise<Blob> {
  const full = await decodeUrl(url, 1400);
  const plan = await planPhoto(full);
  const after = await renderLook(full, plan.features, plan.group, plan.lookId, plan.strength, "sheet-before-after");
  const gap = 32;
  const labelH = 64;
  const { canvas, ctx } = sheet(full.width * 2 + gap * 3, full.height + labelH + gap * 2);
  ctx.drawImage(toCanvas(full), gap, gap, full.width, full.height);
  ctx.drawImage(toCanvas(after), gap * 2 + full.width, gap, full.width, full.height);
  ctx.fillStyle = MUTED;
  ctx.font = "500 22px system-ui, sans-serif";
  const base = gap + full.height + 40;
  ctx.fillText("Original", gap, base);
  ctx.fillStyle = INK;
  ctx.fillText(getLook(plan.lookId).name, gap * 2 + full.width, base);
  return jpeg(canvas);
}
