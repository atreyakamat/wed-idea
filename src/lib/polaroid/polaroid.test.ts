import { describe, expect, it } from "vitest";
import { estimateTextWidthMm, fitFontSize } from "./fit-text";
import { A4_HEIGHT_MM, A4_WIDTH_MM, computeSheetLayout } from "./sheet";
import { getTemplate, TEMPLATES } from "./templates";
import { eventThemeSchema, resolvePalette, resolveTheme } from "./theme";
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "./types";

describe("text fitting", () => {
  const slot = { font: "script" as const, sizePt: 17, minSizePt: 10, maxWidthMm: 30 };

  it("keeps the full size for short names", () => {
    expect(fitFontSize("Ana & Raj", slot)).toEqual({ sizePt: 17, overflows: false });
  });

  it("shrinks long names to fit", () => {
    const result = fitFontSize("Ananya & Rohan", slot);
    expect(result.sizePt).toBeLessThan(17);
    expect(result.sizePt).toBeGreaterThanOrEqual(10);
    expect(estimateTextWidthMm("Ananya & Rohan", "script", result.sizePt)).toBeLessThanOrEqual(30);
  });

  it("stops at the minimum size and flags overflow for very long text", () => {
    const result = fitFontSize("Alexandrina Fernandes & Maximilian D'Souza", slot);
    expect(result).toEqual({ sizePt: 10, overflows: true });
  });

  it("counts letter spacing", () => {
    expect(estimateTextWidthMm("ABC", "serif", 10, 0.5)).toBeGreaterThan(estimateTextWidthMm("ABC", "serif", 10));
    expect(estimateTextWidthMm("", "serif", 10)).toBe(0);
  });
});

describe("A4 sheet layout", () => {
  const layout = computeSheetLayout();

  it("fits 10 mini polaroids, turned sideways", () => {
    expect(layout.slots).toHaveLength(10);
    expect(layout.slots.every((s) => s.rotated)).toBe(true);
    expect(layout.slots[0]).toMatchObject({ w: CARD_HEIGHT_MM, h: CARD_WIDTH_MM });
  });

  it("keeps every card inside the printer's 3 mm margin", () => {
    for (const s of layout.slots) {
      expect(s.x).toBeGreaterThanOrEqual(3);
      expect(s.y).toBeGreaterThanOrEqual(3);
      expect(s.x + s.w).toBeLessThanOrEqual(A4_WIDTH_MM - 3);
      expect(s.y + s.h).toBeLessThanOrEqual(A4_HEIGHT_MM - 3);
    }
  });

  it("leaves at least 3 mm between cards for cutting", () => {
    const slots = layout.slots;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(3 - 1e-9);
      }
    }
  });

  it("centres the grid on the page", () => {
    const left = Math.min(...layout.slots.map((s) => s.x));
    const right = A4_WIDTH_MM - Math.max(...layout.slots.map((s) => s.x + s.w));
    expect(left).toBeCloseTo(right, 6);
  });

  it("lists each cut line once", () => {
    expect(layout.cutsX).toHaveLength(4);
    expect(layout.cutsY).toHaveLength(10);
  });

  it("keeps cards upright when that fits more", () => {
    const tall = computeSheetLayout({ pageWidth: 120, pageHeight: 200 });
    expect(tall.slots.every((s) => !s.rotated)).toBe(true);
  });
});

describe("templates", () => {
  it("have unique ids", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s keeps the photo and text on the card", (_id, t) => {
    expect(t.photo.x).toBeGreaterThanOrEqual(0);
    expect(t.photo.y).toBeGreaterThanOrEqual(0);
    expect(t.photo.x + t.photo.w).toBeLessThanOrEqual(CARD_WIDTH_MM);
    expect(t.photo.y + t.photo.h).toBeLessThanOrEqual(CARD_HEIGHT_MM);
    for (const slot of t.text) {
      expect(slot.y).toBeLessThanOrEqual(CARD_HEIGHT_MM);
      expect(slot.minSizePt).toBeLessThanOrEqual(slot.sizePt);
      if (slot.field === "static") expect(slot.value).toBeTruthy();
    }
    expect(t.text.some((s) => s.field === "names")).toBe(true);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s keeps decorations off the photo", (_id, t) => {
    const p = t.photo;
    for (const d of t.decorations.filter((d) => d.kind !== "band")) {
      const r = d.size / 2;
      const overlapsX = d.x + r > p.x + 1 && d.x - r < p.x + p.w - 1;
      const overlapsY = d.y + r > p.y + 1 && d.y - r < p.y + p.h - 1;
      // Corner flourishes may sit just over the photo edge, never deep inside it.
      if (overlapsX && overlapsY) {
        const insideX = Math.min(d.x - p.x, p.x + p.w - d.x);
        const insideY = Math.min(d.y - p.y, p.y + p.h - d.y);
        expect(Math.min(insideX, insideY), `${d.kind} at ${d.x},${d.y}`).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("event theme", () => {
  const valid = {
    templateId: "elegant-floral",
    palette: { primary: "#112233" },
    text: { names: "  Priya & Rahul ", date: "12 · 12 · 2026" },
  };

  it("accepts a valid theme and trims text", () => {
    const theme = eventThemeSchema.parse(valid);
    expect(theme.text.names).toBe("Priya & Rahul");
    expect(theme.lockedAt).toBeNull();
  });

  it("rejects unknown templates, bad colours and empty names", () => {
    expect(eventThemeSchema.safeParse({ ...valid, templateId: "nope" }).success).toBe(false);
    expect(eventThemeSchema.safeParse({ ...valid, palette: { primary: "red" } }).success).toBe(false);
    expect(eventThemeSchema.safeParse({ ...valid, text: { names: " ", date: "x" } }).success).toBe(false);
    expect(eventThemeSchema.safeParse({ ...valid, text: { names: "x".repeat(41), date: "x" } }).success).toBe(false);
  });

  it("layers the couple's colours over the template defaults", () => {
    const template = getTemplate("elegant-floral")!;
    const palette = resolvePalette(template, { primary: "#112233" });
    expect(palette.primary).toBe("#112233");
    expect(palette.paper).toBe(template.defaultPalette.paper);
    const resolved = resolveTheme(eventThemeSchema.parse(valid));
    expect(resolved.template.id).toBe("elegant-floral");
    expect(resolved.palette.primary).toBe("#112233");
  });
});
