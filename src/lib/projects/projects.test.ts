import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { exifDateToIso, readTakenAt } from "./exif";
import { parseProjectForm } from "./form";
import { downloadName } from "./gallery";
import { isPhotoFile, lookName, needsPcApp, projectFileName, projectPhotoPaths } from "./paths";
import { projectGalleryUrl, projectShareMessage, whatsappShareLink } from "./share";
import { uniqueProjectSlug } from "./slug";
import { bearerToken, hashWorkerToken, makeWorkerToken, WORKER_TOKEN_PATTERN } from "./worker-token";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const PHOTO = "33333333-3333-4333-8333-333333333333";

/** A minimal JPEG whose EXIF holds DateTimeOriginal (and optionally its offset). */
function jpegWithExif(date: string, offset?: string, little = false): ArrayBuffer {
  const entries: { tag: number; value: string }[] = [{ tag: 0x9003, value: date }];
  if (offset) entries.push({ tag: 0x9011, value: offset });
  const bytes: number[] = [];
  const u16 = (n: number) => (little ? bytes.push(n & 0xff, n >> 8) : bytes.push(n >> 8, n & 0xff));
  const u32 = (n: number) => (little ? bytes.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24) : bytes.push(n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff));
  // TIFF header
  bytes.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]));
  u16(42);
  u32(8);
  // IFD0: one entry, the EXIF pointer
  u16(1);
  const exifIfdAt = 8 + 2 + 12 + 4;
  u16(0x8769);
  u16(4);
  u32(1);
  u32(exifIfdAt);
  u32(0);
  // EXIF IFD
  u16(entries.length);
  let dataAt = exifIfdAt + 2 + entries.length * 12 + 4;
  const data: number[] = [];
  for (const e of entries) {
    const value = [...e.value].map((c) => c.charCodeAt(0)).concat(0);
    u16(e.tag);
    u16(2);
    u32(value.length);
    u32(dataAt);
    data.push(...value);
    dataAt += value.length;
  }
  u32(0);
  bytes.push(...data);
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...bytes];
  const size = exif.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 0xff, ...exif, 0xff, 0xda, 0, 2]).buffer;
}

describe("readTakenAt", () => {
  it("reads DateTimeOriginal as India time by default", () => {
    expect(readTakenAt(jpegWithExif("2026:11:08 18:42:07"))).toBe("2026-11-08T13:12:07.000Z");
  });
  it("uses the camera's own offset when it wrote one", () => {
    expect(readTakenAt(jpegWithExif("2026:11:08 18:42:07", "+00:00"))).toBe("2026-11-08T18:42:07.000Z");
  });
  it("reads little-endian EXIF too", () => {
    expect(readTakenAt(jpegWithExif("2026:01:02 03:04:05", undefined, true))).toBe("2026-01-01T21:34:05.000Z");
  });
  it("returns null for files without EXIF or that aren't JPEGs", () => {
    expect(readTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull();
    expect(readTakenAt(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(readTakenAt(new ArrayBuffer(0))).toBeNull();
  });
  it("rejects blank or nonsense camera dates", () => {
    expect(exifDateToIso("0000:00:00 00:00:00")).toBeNull();
    expect(exifDateToIso("not a date")).toBeNull();
    expect(exifDateToIso("2026:11:08 18:42:07", "garbage")).toBe("2026-11-08T13:12:07.000Z");
  });
});

describe("paths", () => {
  it("puts every file in the project's folder", () => {
    expect(projectPhotoPaths(ORG, PROJECT, PHOTO)).toEqual({
      full: `${ORG}/${PROJECT}/${PHOTO}.jpg`,
      thumb: `${ORG}/${PROJECT}/${PHOTO}.thumb.jpg`,
      editedFull: `${ORG}/${PROJECT}/${PHOTO}.edit.jpg`,
      editedThumb: `${ORG}/${PROJECT}/${PHOTO}.edit.thumb.jpg`,
    });
    expect(() => projectPhotoPaths(ORG, "../x", PHOTO)).toThrow();
  });
  it("keeps only photos, skipping hidden and system files", () => {
    expect(isPhotoFile("Shoot/IMG_0001.JPG")).toBe(true);
    expect(isPhotoFile("a.webp")).toBe(true);
    expect(isPhotoFile("Shoot/._IMG_0001.JPG")).toBe(false);
    expect(isPhotoFile(".DS_Store")).toBe(false);
    expect(isPhotoFile("Thumbs.db")).toBe(false);
    expect(isPhotoFile("clip.mp4")).toBe(false);
  });
  it("names files by their path inside the dropped folder", () => {
    expect(projectFileName("Meera 30th/Ceremony/IMG_1.JPG")).toBe("Ceremony/IMG_1.JPG");
    expect(projectFileName("Meera 30th/IMG_1.JPG")).toBe("IMG_1.JPG");
    expect(projectFileName("IMG_1.JPG")).toBe("IMG_1.JPG");
    expect(projectFileName(`Shoot/${"a".repeat(300)}.jpg`)).toHaveLength(255);
  });
  it("flags HEIC for the PC app", () => {
    expect(needsPcApp("IMG_1.HEIC")).toBe(true);
    expect(needsPcApp("IMG_1.jpg")).toBe(false);
  });
});

describe("lookName", () => {
  it("shows look ids as names", () => {
    expect(lookName("golden-glow")).toBe("Golden Glow");
    expect(lookName("bright-airy")).toBe("Bright & Airy");
    expect(lookName("classic-bw")).toBe("Classic B&W");
  });
});

describe("uniqueProjectSlug", () => {
  it("makes a short name, numbered when taken", () => {
    expect(uniqueProjectSlug("Meera's 30th!", new Set())).toBe("meeras-30th");
    expect(uniqueProjectSlug("Meera’s 30th!", new Set(["meeras-30th", "meeras-30th-2"]))).toBe("meeras-30th-3");
    expect(uniqueProjectSlug("Rock Night", new Set())).toBe("rock-night");
  });
  it("always gives a valid slug", () => {
    expect(uniqueProjectSlug("🎉", new Set())).toBe("project");
    expect(uniqueProjectSlug("Al", new Set())).toBe("project-al");
    expect(uniqueProjectSlug("x".repeat(200), new Set()).length).toBeLessThanOrEqual(60);
  });
});

describe("parseProjectForm", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  it("accepts a name, kind and optional date", () => {
    expect(parseProjectForm(form({ name: " Meera ", kind: "birthday", shoot_date: "" }))).toEqual({
      ok: true,
      data: { name: "Meera", kind: "birthday", shoot_date: null },
    });
    expect(parseProjectForm(form({ name: "M", kind: "concert", shoot_date: "2026-11-08" }))).toMatchObject({ ok: true, data: { shoot_date: "2026-11-08" } });
  });
  it("explains what's wrong", () => {
    const result = parseProjectForm(form({ name: "", kind: "rave", shoot_date: "08/11/2026" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["kind", "name", "shoot_date"]);
  });
});

describe("sharing", () => {
  it("builds the gallery link and message", () => {
    const url = projectGalleryUrl("https://cwp.in/", "ab".repeat(24));
    expect(url).toBe(`https://cwp.in/p/${"ab".repeat(24)}`);
    const message = projectShareMessage({ projectName: "Meera's 30th", studioName: "Saltwater", url, expiresAt: "2026-11-18T18:29:00Z" });
    expect(message).toContain(url);
    expect(message).toContain("18 November");
    expect(whatsappShareLink(message)).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
  it("names downloads after the original file", () => {
    expect(downloadName("Ceremony/IMG_0001.JPG")).toBe("IMG_0001.jpg");
    expect(downloadName("my photo (1).png")).toBe("my-photo-1-.jpg");
  });
});

describe("worker tokens", () => {
  it("are random, recognisable and stored only as a hash", () => {
    const a = makeWorkerToken();
    const b = makeWorkerToken();
    expect(a.token).toMatch(WORKER_TOKEN_PATTERN);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashWorkerToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hint).toBe(a.token.slice(-4));
  });
  it("are read only from a well-formed Bearer header", () => {
    const { token } = makeWorkerToken();
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer  ${token} `)).toBe(token);
    expect(bearerToken(token)).toBeNull();
    expect(bearerToken("Bearer cwp_wk_short")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
