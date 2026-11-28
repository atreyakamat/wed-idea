import { describe, expect, it } from "vitest";
import {
  canSendToStudio,
  dayProjectName,
  firstSendableMembership,
  isJsonBody,
  isSameOrigin,
  parseProjectName,
  sendableMembership,
} from "./rules";

describe("canSendToStudio", () => {
  it("lets owners, admins and team members send", () => {
    expect(canSendToStudio("owner")).toBe(true);
    expect(canSendToStudio("admin")).toBe(true);
    expect(canSendToStudio("operator")).toBe(true);
  });

  it("refuses anything else, including missing and unknown roles", () => {
    expect(canSendToStudio("viewer")).toBe(false);
    expect(canSendToStudio("")).toBe(false);
    expect(canSendToStudio(null)).toBe(false);
    expect(canSendToStudio(undefined)).toBe(false);
    expect(canSendToStudio("OWNER")).toBe(false);
  });
});

describe("membership choice", () => {
  const rows = [
    { studioId: "s1", role: "viewer" },
    { studioId: "s2", role: "operator" },
    { studioId: "s3", role: "admin" },
  ];

  it("takes the first membership that may send, skipping the rest", () => {
    expect(firstSendableMembership(rows)?.studioId).toBe("s2");
    expect(firstSendableMembership([{ role: "viewer" }])).toBeNull();
    expect(firstSendableMembership([])).toBeNull();
  });

  it("finds one studio only when that membership may send", () => {
    expect(sendableMembership(rows, "s3")?.role).toBe("admin");
    expect(sendableMembership(rows, "s1")).toBeNull();
    expect(sendableMembership(rows, "missing")).toBeNull();
  });
});

describe("parseProjectName", () => {
  it("trims and accepts names of 1 to 120 characters", () => {
    expect(parseProjectName("  Meera 30th  ")).toBe("Meera 30th");
    expect(parseProjectName("a")).toBe("a");
    expect(parseProjectName("x".repeat(120))).toHaveLength(120);
  });

  it("refuses empty, too long, and non-string values", () => {
    expect(parseProjectName("")).toBeNull();
    expect(parseProjectName("   ")).toBeNull();
    expect(parseProjectName("x".repeat(121))).toBeNull();
    expect(parseProjectName(42)).toBeNull();
    expect(parseProjectName(undefined)).toBeNull();
  });
});

describe("dayProjectName", () => {
  it("names a project for the local day it is sent", () => {
    expect(dayProjectName(new Date(2026, 10, 28, 9, 30))).toBe("Camera 2026-11-28");
    expect(dayProjectName(new Date(2027, 0, 5, 23, 59))).toBe("Camera 2027-01-05");
  });
});

describe("isSameOrigin", () => {
  it("accepts the site's own origin", () => {
    expect(isSameOrigin("https://wedpola.example", "https://wedpola.example/api/camera/session")).toBe(true);
  });

  it("refuses another site, a missing Origin, and a bad one", () => {
    expect(isSameOrigin("https://evil.example", "https://wedpola.example/api/camera/projects")).toBe(false);
    expect(isSameOrigin(null, "https://wedpola.example/api/camera/projects")).toBe(false);
    expect(isSameOrigin("not a url", "https://wedpola.example/api/camera/projects")).toBe(false);
    expect(isSameOrigin("http://wedpola.example", "https://wedpola.example/x")).toBe(false);
  });
});

describe("isJsonBody", () => {
  it("accepts application/json with or without parameters", () => {
    expect(isJsonBody("application/json")).toBe(true);
    expect(isJsonBody("application/json; charset=utf-8")).toBe(true);
    expect(isJsonBody("Application/JSON")).toBe(true);
  });

  it("refuses forms and other types, which a cross-site page could send", () => {
    expect(isJsonBody("text/plain")).toBe(false);
    expect(isJsonBody("application/x-www-form-urlencoded")).toBe(false);
    expect(isJsonBody("multipart/form-data; boundary=x")).toBe(false);
    expect(isJsonBody(null)).toBe(false);
  });
});
