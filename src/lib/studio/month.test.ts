import { describe, expect, it } from "vitest";
import { istMonthRange } from "./month";

describe("istMonthRange", () => {
  it("uses India's month, not UTC's", () => {
    // 31 Oct 20:00 UTC is already 1 Nov 01:30 in India.
    const r = istMonthRange(new Date("2026-10-31T20:00:00Z"));
    expect(r).toEqual({ start: "2026-10-31T18:30:00.000Z", end: "2026-11-30T18:30:00.000Z", label: "November 2026" });
  });

  it("rolls over the year", () => {
    expect(istMonthRange(new Date("2026-12-15T06:00:00Z"))).toMatchObject({ end: "2026-12-31T18:30:00.000Z", label: "December 2026" });
  });
});
