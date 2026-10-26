import { describe, expect, it } from "vitest";
import { safeAppRedirect } from "./safe-redirect";

describe("safeAppRedirect", () => {
  it.each(["/dashboard", "/dashboard/events/123", "/dashboard?tab=design", "/onboarding"])("keeps %s", (path) => {
    expect(safeAppRedirect(path)).toBe(path);
  });

  it.each([
    ["external URL", "https://evil.com/dashboard"],
    ["protocol-relative URL", "//evil.com"],
    ["public page", "/e/priya-rahul"],
    ["lookalike prefix", "/dashboardevil"],
    ["backslash trick", "/dashboard\\..\\evil"],
    ["login page", "/login"],
    ["missing value", undefined],
  ])("falls back for %s", (_label, next) => {
    expect(safeAppRedirect(next)).toBe("/dashboard");
  });
});
