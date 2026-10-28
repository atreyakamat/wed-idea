import { describe, expect, it } from "vitest";
import { describeAudit, formatBytes, formatCount, isStudioStatus } from "./format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [-5, "0 B"],
    [900, "900 B"],
    [350_000, "342 KB"],
    [5 * 1024 ** 2, "5.0 MB"],
    [1.5e9, "1.4 GB"],
    [250 * 1024 ** 3, "250 GB"],
  ])("%d bytes -> %s", (bytes, label) => {
    expect(formatBytes(bytes)).toBe(label);
  });
});

describe("formatCount", () => {
  it("uses Indian digit grouping", () => {
    expect(formatCount(1234567)).toBe("12,34,567");
  });
});

describe("isStudioStatus", () => {
  it("accepts only real statuses", () => {
    expect(isStudioStatus("past_due")).toBe(true);
    expect(isStudioStatus("deleted")).toBe(false);
    expect(isStudioStatus(undefined)).toBe(false);
  });
});

describe("describeAudit", () => {
  it("describes status changes with the reason", () => {
    expect(describeAudit("studio.status_changed", { from: "trialing", to: "suspended", reason: "Chargeback" })).toBe(
      "Changed status from Trial to Suspended: Chargeback",
    );
    expect(describeAudit("studio.status_changed", { from: "suspended", to: "active" })).toBe("Changed status from Suspended to Active");
  });

  it("describes trial extensions", () => {
    expect(describeAudit("studio.trial_extended", { days: 14 })).toBe("Extended the trial by 14 days");
    expect(describeAudit("studio.trial_extended", { days: 1 })).toBe("Extended the trial by 1 day");
  });

  it("falls back to the raw action", () => {
    expect(describeAudit("studio.renamed", {})).toBe("studio.renamed");
  });
});
