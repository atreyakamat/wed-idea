import { describe, expect, it } from "vitest";
import { defaultTheme, isDesignLocked, themeForEvent } from "./design";
import { galleryDays, parseEventDetails, parsePrintSettings } from "./form";
import { canUnlockDesign, checkTransition } from "./status";
import { formatIstDate, isoToIstInput, istInputToIso, polaroidDate } from "./time";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const validDetails = {
  couple_names: "Priya & Rahul",
  slug: "priya-rahul",
  venue: "Assagao, Goa",
  starts_at: "2026-12-12T09:00",
  ends_at: "2026-12-12T17:00",
  orders_open_at: "",
  orders_close_at: "",
  gallery_days: "",
  backdrop_brief: "Pampas arch",
};

describe("India time", () => {
  it("converts form times to UTC and back", () => {
    expect(istInputToIso("2026-12-12T09:00")).toBe("2026-12-12T03:30:00.000Z");
    expect(isoToIstInput("2026-12-12T03:30:00.000Z")).toBe("2026-12-12T09:00");
  });

  it("handles times that cross midnight UTC", () => {
    expect(istInputToIso("2026-12-12T02:00")).toBe("2026-12-11T20:30:00.000Z");
    expect(isoToIstInput("2026-12-11T20:30:00.000Z")).toBe("2026-12-12T02:00");
  });

  it("rejects malformed and impossible dates", () => {
    expect(istInputToIso("2026-02-31T10:00")).toBeNull();
    expect(istInputToIso("12/12/2026 9am")).toBeNull();
    expect(istInputToIso("2026-12-12T24:00")).toBeNull();
    expect(isoToIstInput(null)).toBe("");
  });

  it("formats dates for people and for polaroids", () => {
    expect(formatIstDate("2026-12-11T20:30:00.000Z")).toBe("12 Dec 2026");
    expect(polaroidDate("2026-12-11T20:30:00.000Z")).toBe("12 · 12 · 2026");
  });
});

describe("event details form", () => {
  it("defaults the order window to the event and keeps photos 7 days", () => {
    const result = parseEventDetails(form(validDetails));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.orders_open_at).toBe(result.data.starts_at);
    expect(result.data.orders_close_at).toBe(result.data.ends_at);
    expect(result.data.gallery_expires_at).toBe("2026-12-19T11:30:00.000Z");
    expect(galleryDays(result.data.ends_at, result.data.gallery_expires_at)).toBe(7);
  });

  it("uses a custom order window and gallery length", () => {
    const result = parseEventDetails(
      form({ ...validDetails, orders_open_at: "2026-12-12T10:00", orders_close_at: "2026-12-12T16:00", gallery_days: "14" }),
    );
    expect(result.ok && result.data.orders_close_at).toBe("2026-12-12T10:30:00.000Z");
    expect(result.ok && galleryDays(result.data.ends_at, result.data.gallery_expires_at)).toBe(14);
  });

  it("turns empty optional fields into null", () => {
    const result = parseEventDetails(form({ ...validDetails, venue: "", backdrop_brief: "" }));
    expect(result.ok && result.data.venue).toBeNull();
    expect(result.ok && result.data.backdrop_brief).toBeNull();
  });

  it("reports every problem at once and keeps what was typed", () => {
    const result = parseEventDetails(
      form({ ...validDetails, couple_names: "", slug: "Priya Rahul", ends_at: "2026-12-12T08:00", gallery_days: "45" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual(["couple_names", "ends_at", "gallery_days", "slug"]);
    expect(result.values.slug).toBe("Priya Rahul");
  });

  it("rejects an order window that closes before it opens", () => {
    const result = parseEventDetails(
      form({ ...validDetails, orders_open_at: "2026-12-12T16:00", orders_close_at: "2026-12-12T10:00" }),
    );
    expect(!result.ok && result.fieldErrors.orders_close_at).toBeTruthy();
  });

  it("requires start and end times", () => {
    const result = parseEventDetails(form({ ...validDetails, starts_at: "", ends_at: "" }));
    expect(!result.ok && Object.keys(result.fieldErrors).sort()).toEqual(["ends_at", "starts_at"]);
  });
});

describe("print settings form", () => {
  it("parses rupees into paise and blank limits into none", () => {
    expect(parsePrintSettings(form({ print_price: "49", max_copies_per_guest: "", budget_cap: "" }))).toEqual({
      ok: true,
      data: { print_price_paise: 4900, max_copies_per_guest: null, budget_cap_paise: null },
    });
  });

  it("accepts limits", () => {
    const result = parsePrintSettings(form({ print_price: "49.50", max_copies_per_guest: "5", budget_cap: "15,000" }));
    expect(result).toEqual({ ok: true, data: { print_price_paise: 4950, max_copies_per_guest: 5, budget_cap_paise: 1500000 } });
  });

  it("rejects bad amounts", () => {
    const result = parsePrintSettings(form({ print_price: "abc", max_copies_per_guest: "0", budget_cap: "0" }));
    expect(!result.ok && Object.keys(result.fieldErrors).sort()).toEqual(["budget_cap", "max_copies_per_guest", "print_price"]);
    expect(parsePrintSettings(form({ print_price: "5000" })).ok).toBe(false);
  });
});

describe("event status", () => {
  it("goes live only with a locked design", () => {
    expect(checkTransition("draft", "live", false)).toEqual({ allowed: false, reason: "Lock the polaroid design before going live." });
    expect(checkTransition("draft", "live", true)).toEqual({ allowed: true });
  });

  it("follows draft → live → closed → archived", () => {
    expect(checkTransition("live", "closed", true).allowed).toBe(true);
    expect(checkTransition("closed", "live", true).allowed).toBe(true);
    expect(checkTransition("closed", "archived", true).allowed).toBe(true);
    expect(checkTransition("draft", "closed", true).allowed).toBe(false);
    expect(checkTransition("live", "draft", true).allowed).toBe(false);
  });

  it("allows unlocking the design only in draft", () => {
    expect(canUnlockDesign("draft")).toBe(true);
    expect(canUnlockDesign("live")).toBe(false);
    expect(canUnlockDesign("closed")).toBe(false);
  });
});

describe("design", () => {
  const event = { couple_names: "Priya & Rahul", starts_at: "2026-12-12T03:30:00.000Z", venue: "Assagao, Goa", theme: {} };

  it("starts from the event's names, date and venue", () => {
    expect(defaultTheme(event)).toMatchObject({
      templateId: "elegant-floral",
      text: { names: "Priya & Rahul", date: "12 · 12 · 2026", place: "Assagao, Goa" },
      lockedAt: null,
    });
  });

  it("uses a saved design when valid, otherwise the default", () => {
    const saved = { templateId: "azulejo", text: { names: "P & R", date: "12.12.26" }, lockedAt: "2026-11-01T10:00:00.000Z" };
    expect(themeForEvent({ ...event, theme: saved }).templateId).toBe("azulejo");
    expect(themeForEvent({ ...event, theme: { templateId: "nope" } }).templateId).toBe("elegant-floral");
    expect(isDesignLocked(saved)).toBe(true);
    expect(isDesignLocked({})).toBe(false);
  });

  it("trims long names and venues to fit the card", () => {
    const theme = defaultTheme({ ...event, couple_names: "A".repeat(60), venue: "B".repeat(50) });
    expect(theme.text.names).toHaveLength(40);
    expect(theme.text.place).toHaveLength(30);
  });
});
