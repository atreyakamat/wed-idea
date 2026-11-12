import { describe, expect, it } from "vitest";
import { approxSize, columnsFor, downloadParts, masonry, uniqueNames, zipName } from "./gallery-layout";
import { toneFromPixels } from "./tone";

describe("masonry", () => {
  it("keeps photo order and fills the shortest column", () => {
    const tall = { width: 2, height: 3 };
    const wide = { width: 3, height: 2 };
    expect(masonry([tall, wide, wide, wide], 2)).toEqual([[0], [1, 2, 3]]); // 1.5 tall vs 0.67 + 0.67 + 0.67
    expect(masonry([wide, wide, wide], 2)).toEqual([[0, 2], [1]]);
  });
  it("handles one column and zero sizes", () => {
    expect(masonry([{ width: 0, height: 0 }, { width: 1, height: 1 }], 1)).toEqual([[0, 1]]);
  });
  it("picks columns by width", () => {
    expect([columnsFor(390), columnsFor(800), columnsFor(1400)]).toEqual([2, 3, 4]);
  });
});

describe("downloads", () => {
  it("splits into parts", () => {
    expect(downloadParts([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("makes names unique", () => {
    expect(uniqueNames(["IMG_1.jpg", "img_1.jpg", "IMG_1.jpg", "a"])).toEqual(["IMG_1.jpg", "img_1 (2).jpg", "IMG_1 (3).jpg", "a"]);
  });
  it("names zips safely", () => {
    expect(zipName("Meera's 30th / party")).toBe("Meeras-30th-party-photos.zip");
    expect(zipName("Rock Night", { index: 1, total: 3 })).toBe("Rock-Night-photos-part-2-of-3.zip");
    expect(zipName("🎉")).toBe("photos-photos.zip");
  });
  it("estimates size", () => {
    expect(approxSize(10)).toBe("6 MB");
    expect(approxSize(2000)).toBe("1.2 GB");
  });
});

describe("toneFromPixels", () => {
  it("averages colour", () => {
    expect(toneFromPixels([255, 0, 0, 255, 0, 0, 255, 255])).toBe("#800080");
    expect(toneFromPixels([])).toBe("#808080");
  });
});
