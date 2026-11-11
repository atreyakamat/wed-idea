import { describe, expect, it } from "vitest";
import { parsePlanForm } from "./plan-form";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const valid = { name: "Starter", price: "1,499", events_per_month: "4", photos_per_event: "1500", team_seats: "3", gallery_days: "7" };

describe("parsePlanForm", () => {
  it("reads rupees into paise and the branding checkbox", () => {
    expect(parsePlanForm(form({ ...valid, remove_branding: "on" }), false)).toEqual({
      ok: true,
      data: { name: "Starter", price_paise: 149900, events_per_month: 4, photos_per_event: 1500, team_seats: 3, gallery_days: 7, remove_branding: true },
    });
  });

  it("keeps the trial free whatever is typed", () => {
    const parsed = parsePlanForm(form({ ...valid, price: "999" }), true);
    expect(parsed.ok && parsed.data.price_paise).toBe(0);
  });

  it("names every field that's wrong", () => {
    const parsed = parsePlanForm(form({ ...valid, name: "", price: "abc", team_seats: "0", gallery_days: "4.5" }), false);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && Object.keys(parsed.fieldErrors).sort()).toEqual(["gallery_days", "name", "price", "team_seats"]);
  });
});
