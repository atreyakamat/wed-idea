import { describe, expect, it } from "vitest";
import { fitWithin, isGalleryOpen, photoPaths } from "./photos";
import { formatPhone, galleryUrl, GUEST_TOKEN_PATTERN, whatsappLink, whatsappMessage } from "./share";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const EVENT = "bbbbbbbb-0000-4000-8000-000000000002";
const GUEST = "cccccccc-0000-4000-8000-000000000003";
const PHOTO = "dddddddd-0000-4000-8000-000000000004";

describe("photo sizes", () => {
  it("shrinks large photos to fit the long edge, keeping the shape", () => {
    expect(fitWithin(6000, 4000, 2400)).toEqual({ width: 2400, height: 1600 });
    expect(fitWithin(3000, 4000, 900)).toEqual({ width: 675, height: 900 });
  });

  it("never enlarges small photos", () => {
    expect(fitWithin(800, 600, 2400)).toEqual({ width: 800, height: 600 });
  });

  it("rejects empty images", () => {
    expect(() => fitWithin(0, 100, 900)).toThrow();
  });
});

describe("photo paths", () => {
  it("puts both files in the studio's event folder", () => {
    expect(photoPaths(ORG, EVENT, GUEST, PHOTO)).toEqual({
      full: `${ORG}/${EVENT}/${GUEST}/${PHOTO}.jpg`,
      thumb: `${ORG}/${EVENT}/${GUEST}/${PHOTO}.thumb.jpg`,
    });
  });

  it("refuses ids that could escape the folder", () => {
    expect(() => photoPaths(ORG, EVENT, GUEST, "../../other")).toThrow();
    expect(() => photoPaths("x", EVENT, GUEST, PHOTO)).toThrow();
  });
});

describe("gallery expiry", () => {
  it("is open until the expiry time", () => {
    const expires = "2026-12-19T11:30:00.000Z";
    expect(isGalleryOpen(expires, new Date("2026-12-19T11:29:59Z"))).toBe(true);
    expect(isGalleryOpen(expires, new Date("2026-12-19T11:30:00Z"))).toBe(false);
  });
});

describe("sharing", () => {
  const url = galleryUrl("https://example.com/", "a".repeat(48));

  it("builds the guest's gallery link", () => {
    expect(url).toBe(`https://example.com/g/${"a".repeat(48)}`);
    expect(GUEST_TOKEN_PATTERN.test("a".repeat(48))).toBe(true);
    expect(GUEST_TOKEN_PATTERN.test("a".repeat(47))).toBe(false);
  });

  it("writes a friendly WhatsApp message with the link and expiry", () => {
    const message = whatsappMessage({
      guestName: "Asha Fernandes",
      coupleNames: "Priya & Rahul",
      url,
      expiresAt: "2026-12-19T11:30:00.000Z",
    });
    expect(message).toContain("Hi Asha!");
    expect(message).toContain("Priya & Rahul's wedding");
    expect(message).toContain(url);
    expect(message).toContain("until 19 December");
    expect(whatsappMessage({ guestName: null, coupleNames: "P & R", url, expiresAt: "2026-12-19T11:30:00.000Z" })).toMatch(/^Hi!/);
  });

  it("makes a click-to-chat link with only digits in the number", () => {
    const link = whatsappLink("+919812345678", "Hi & bye\nnew line");
    expect(link).toBe("https://wa.me/919812345678?text=Hi%20%26%20bye%0Anew%20line");
  });

  it("formats Indian numbers for display", () => {
    expect(formatPhone("+919812345678")).toBe("+91 98123 45678");
    expect(formatPhone("+971501234567")).toBe("+971501234567");
  });
});
