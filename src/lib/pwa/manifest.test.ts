import { describe, expect, it } from "vitest";
import { APP_COLOR, APP_START_URL, buildManifest } from "./manifest";

describe("install manifest", () => {
  const manifest = buildManifest();

  it("is named Wedding Pola and opens the camera full screen", () => {
    expect(manifest.name).toBe("Wedding Pola");
    expect(manifest.short_name).toBe("Wedding Pola");
    expect(manifest.start_url).toBe("/camera");
    expect(APP_START_URL).toBe("/camera");
    expect(manifest.display).toBe("standalone");
    expect(manifest.scope).toBe("/");
  });

  it("matches the camera's colours", () => {
    expect(manifest.theme_color).toBe(APP_COLOR);
    expect(manifest.background_color).toBe(APP_COLOR);
    expect(APP_COLOR).toBe("#07070a");
  });

  it("has 192 and 512 PNG icons", () => {
    expect(manifest.icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ]);
  });
});
