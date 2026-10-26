import { describe, expect, it } from "vitest";
import { safeAdminRedirect } from "./safe-redirect";

describe("safeAdminRedirect", () => {
  it("keeps admin paths", () => {
    expect(safeAdminRedirect("/admin/events/123")).toBe("/admin/events/123");
  });

  it.each([
    ["external URL", "https://evil.com/admin"],
    ["protocol-relative URL", "//evil.com"],
    ["non-admin path", "/e/priya-rahul"],
    ["backslash trick", "/admin\\..\\evil"],
    ["login loop", "/admin/login"],
    ["missing value", undefined],
  ])("falls back for %s", (_label, next) => {
    expect(safeAdminRedirect(next)).toBe("/admin");
  });
});
