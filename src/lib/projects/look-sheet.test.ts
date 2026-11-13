import { describe, expect, it } from "vitest";
import { gridPositions, validDesigns } from "./look-sheet";

describe("validDesigns", () => {
  it("keeps known designs in a fixed order and drops the rest", () => {
    expect(validDesigns(["before-after", "nonsense", "grid", "grid"])).toEqual(["grid", "before-after"]);
  });
  it("treats anything that isn't a list as none", () => {
    expect(validDesigns(null)).toEqual([]);
    expect(validDesigns("grid")).toEqual([]);
  });
});

describe("gridPositions", () => {
  it("lays tiles out in rows with the gap around each", () => {
    const p = gridPositions(7, 5, 100, 50, 10);
    expect(p[0]).toEqual({ x: 10, y: 10 });
    expect(p[4]).toEqual({ x: 450, y: 10 });
    expect(p[5]).toEqual({ x: 10, y: 70 });
    expect(p).toHaveLength(7);
  });
});
