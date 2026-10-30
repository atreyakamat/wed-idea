import { describe, expect, it } from "vitest";
import { auditSubject, describeAudit, formatBytes, formatCount, isStudioStatus } from "./format";

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

  it("describes plan changes and payments", () => {
    expect(describeAudit("studio.plan_changed", { from: "trial", to: "starter" })).toBe("Changed plan from Trial to Starter");
    expect(
      describeAudit("studio.payment_recorded", { plan: "pro", amount_paise: 399900, method: "upi", reference: "UPI-1", months: 3 }),
    ).toBe("Recorded ₹3,999 by UPI (UPI-1) for Pro, 3 months");
    expect(describeAudit("studio.payment_recorded", { plan: "starter", amount_paise: 149900, method: "cash", months: 1 })).toBe(
      "Recorded ₹1,499 by Cash for Starter, 1 month",
    );
  });

  it("lists what changed on a plan", () => {
    expect(
      describeAudit("plan.updated", {
        plan: "starter",
        before: { name: "Starter", price_paise: 149900, team_seats: 3, remove_branding: false },
        after: { name: "Starter", price_paise: 159900, team_seats: 4, remove_branding: false },
      }),
    ).toBe("Edited the Starter plan: price ₹1,499 → ₹1,599, seats 3 → 4");
  });

  it("falls back to the raw action", () => {
    expect(describeAudit("studio.renamed", {})).toBe("studio.renamed");
  });
});

describe("auditSubject", () => {
  it("names the studio, or the platform for plan edits", () => {
    expect(auditSubject({ organization_id: "x", studio_name: "Saltwater" })).toBe("Saltwater");
    expect(auditSubject({ organization_id: null, studio_name: null })).toBe("Platform");
    expect(auditSubject({ organization_id: "x", studio_name: null })).toBe("Deleted studio");
  });
});
