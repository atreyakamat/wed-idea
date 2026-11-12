import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { EDIT_VERSION_PATTERN, editVersionPaths, newEditVersion } from "./paths";
import { parseCheck, validEditChoice } from "./review";

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const PHOTO = "33333333-3333-4333-8333-333333333333";

describe("edit versions", () => {
  it("are 8 random lower-case letters and digits", () => {
    const seen = new Set(Array.from({ length: 50 }, newEditVersion));
    expect(seen.size).toBe(50);
    for (const v of seen) expect(v).toMatch(EDIT_VERSION_PATTERN);
  });

  it("sit next to the photo", () => {
    expect(editVersionPaths(ORG, PROJECT, PHOTO, "ab12cd34")).toEqual({
      full: `${ORG}/${PROJECT}/${PHOTO}.edit.ab12cd34.jpg`,
      thumb: `${ORG}/${PROJECT}/${PHOTO}.edit.ab12cd34.thumb.jpg`,
    });
  });

  it("refuse odd versions and ids", () => {
    expect(() => editVersionPaths(ORG, PROJECT, PHOTO, "../x")).toThrow();
    expect(() => editVersionPaths(ORG, PROJECT, "nope", "ab12cd34")).toThrow();
  });
});

describe("edit choices", () => {
  it("are a version, a light and a look, or null for the plain photo", () => {
    expect(validEditChoice(null)).toBe(true);
    expect(validEditChoice({ version: "ab12cd34", lighting: "golden", look: "honey-film" })).toBe(true);
    expect(validEditChoice({ version: "AB12CD34", lighting: "golden", look: "honey-film" })).toBe(false);
    expect(validEditChoice({ version: "ab12cd34", lighting: "moon", look: "honey-film" })).toBe(false);
    expect(validEditChoice({ version: "ab12cd34", lighting: "golden", look: "Honey Film" })).toBe(false);
    expect(validEditChoice("honey-film")).toBe(false);
  });
});

describe("shot checks", () => {
  const good = { sharpness: 120.5, brightness: 0.4, clipped: 0.01, dark: 0.02, dhash: "0123456789abcdef", faces: 2, eyesClosed: 1 };

  it("accept sane numbers", () => {
    expect(parseCheck(good)).toEqual(good);
    expect(parseCheck({ ...good, faces: null, eyesClosed: null })).toEqual({ ...good, faces: 0, eyesClosed: 0 });
  });

  it("refuse odd ones", () => {
    expect(parseCheck(null)).toBeNull();
    expect(parseCheck({ ...good, brightness: 2 })).toBeNull();
    expect(parseCheck({ ...good, sharpness: Number.NaN })).toBeNull();
    expect(parseCheck({ ...good, dhash: "xyz" })).toBeNull();
    expect(parseCheck({ ...good, faces: 1.5 })).toBeNull();
    expect(parseCheck({ ...good, eyesClosed: 99 })).toBeNull();
  });
});
