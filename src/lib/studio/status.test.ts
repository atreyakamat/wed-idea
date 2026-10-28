import { describe, expect, it } from "vitest";
import { daysLeft, isSuspendedError, studioNotice } from "./status";

const now = new Date("2026-11-01T10:00:00+05:30");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("daysLeft", () => {
  it("rounds part days up and stops at zero", () => {
    expect(daysLeft(inDays(2.2), now)).toBe(3);
    expect(daysLeft(inDays(1), now)).toBe(1);
    expect(daysLeft(inDays(-3), now)).toBe(0);
  });
});

describe("studioNotice", () => {
  const base = { trialEndsAt: inDays(14), suspendedReason: null };

  it("stays quiet for active studios and long trials", () => {
    expect(studioNotice({ ...base, status: "active" }, now)).toBeNull();
    expect(studioNotice({ ...base, status: "trialing" }, now)).toBeNull();
  });

  it("counts down the last week of a trial", () => {
    expect(studioNotice({ ...base, status: "trialing", trialEndsAt: inDays(3) }, now)?.title).toBe("3 days left in your trial");
    expect(studioNotice({ ...base, status: "trialing", trialEndsAt: inDays(0.5) }, now)?.title).toBe("1 day left in your trial");
    expect(studioNotice({ ...base, status: "trialing", trialEndsAt: inDays(-1) }, now)).toMatchObject({ tone: "warning", title: "Your trial has ended" });
  });

  it("explains a suspension with the reason", () => {
    const notice = studioNotice({ ...base, status: "suspended", suspendedReason: "Payment failed." }, now);
    expect(notice?.tone).toBe("danger");
    expect(notice?.body).toMatch(/^Payment failed\. You can't start events/);
  });

  it("warns about late payment", () => {
    expect(studioNotice({ ...base, status: "past_due" }, now)?.tone).toBe("warning");
  });
});

describe("isSuspendedError", () => {
  it("spots only the suspension refusal", () => {
    expect(isSuspendedError({ code: "42501", message: "This studio is suspended. Contact support." })).toBe(true);
    expect(isSuspendedError({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(isSuspendedError({ code: "23505", message: "suspended" })).toBe(false);
    expect(isSuspendedError(null)).toBe(false);
  });
});
