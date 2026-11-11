import { describe, expect, it } from "vitest";
import { adminNext, parseTotpCode } from "./next";

describe("adminNext", () => {
  it.each(["/admin", "/admin/studios", "/admin/studios/abc?tab=events", "/admin?x=1"])("keeps %s", (path) => {
    expect(adminNext(path)).toBe(path);
  });

  it.each([
    ["the MFA page itself", "/admin/mfa"],
    ["the MFA page with a query", "/admin/mfa?next=/admin"],
    ["a studio page", "/dashboard"],
    ["an external URL", "https://evil.com/admin"],
    ["a look-alike prefix", "/administrator"],
    ["nothing", undefined],
  ])("sends %s to /admin", (_label, path) => {
    expect(adminNext(path)).toBe("/admin");
  });
});

describe("parseTotpCode", () => {
  it("accepts six digits with optional spaces or a dash", () => {
    expect(parseTotpCode("123456")).toBe("123456");
    expect(parseTotpCode(" 123 456 ")).toBe("123456");
    expect(parseTotpCode("123-456")).toBe("123456");
  });

  it("rejects anything else", () => {
    for (const bad of ["", "12345", "1234567", "12345a", "abcdef"]) expect(parseTotpCode(bad)).toBeNull();
  });
});
