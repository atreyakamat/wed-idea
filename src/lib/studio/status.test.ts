import { describe, expect, it } from "vitest";
import { accessFor, blockedMessage, canCapture, canStartWork, daysLeft, friendlyDbError, studioNotice } from "./status";

const now = new Date("2026-11-01T10:00:00+05:30");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

describe("daysLeft", () => {
  it("rounds part days up and stops at zero", () => {
    expect(daysLeft(inDays(2.2), now)).toBe(3);
    expect(daysLeft(inDays(1), now)).toBe(1);
    expect(daysLeft(inDays(-3), now)).toBe(0);
  });
});

describe("accessFor (same cases as the database's access_for)", () => {
  it.each([
    ["trial running", { status: "trialing", trialEndsAt: inDays(3), paidUntil: null }, "ok"],
    ["trial over", { status: "trialing", trialEndsAt: inDays(-0.001), paidUntil: null }, "trial_ended"],
    ["paid", { status: "active", trialEndsAt: inDays(0), paidUntil: inDays(10) }, "ok"],
    ["complimentary", { status: "active", trialEndsAt: inDays(0), paidUntil: null }, "ok"],
    ["2 days late", { status: "active", trialEndsAt: inDays(0), paidUntil: inDays(-2) }, "payment_due"],
    ["8 days late", { status: "active", trialEndsAt: inDays(0), paidUntil: inDays(-8) }, "payment_overdue"],
    ["flagged by admin", { status: "past_due", trialEndsAt: inDays(0), paidUntil: inDays(3) }, "payment_due"],
    ["flagged, never paid", { status: "past_due", trialEndsAt: inDays(0), paidUntil: null }, "payment_overdue"],
    ["suspended", { status: "suspended", trialEndsAt: inDays(3), paidUntil: null }, "suspended"],
  ] as const)("%s -> %s", (_label, fields, expected) => {
    expect(accessFor(fields, now)).toBe(expected);
  });
});

describe("what each state allows", () => {
  it("lets ok and payment-due studios start work", () => {
    expect(canStartWork("ok")).toBe(true);
    expect(canStartWork("payment_due")).toBe(true);
    expect(canStartWork("trial_ended")).toBe(false);
    expect(canStartWork("payment_overdue")).toBe(false);
    expect(canStartWork("suspended")).toBe(false);
  });

  it("lets a live wedding finish, up to 12 hours after it ends", () => {
    expect(canCapture("trial_ended", inHours(2), now)).toBe(true);
    expect(canCapture("trial_ended", inHours(-11), now)).toBe(true);
    expect(canCapture("trial_ended", inHours(-13), now)).toBe(false);
    expect(canCapture("payment_overdue", inHours(-13), now)).toBe(false);
    expect(canCapture("suspended", inHours(2), now)).toBe(false);
    expect(canCapture("ok", inDays(-30), now)).toBe(true);
  });

  it("explains blocked states in the database's words", () => {
    expect(blockedMessage("trial_ended")).toBe("Your trial has ended. Choose a plan to start new events.");
    expect(blockedMessage("payment_overdue")).toBe("Your payment is overdue. Settle it to start new events.");
    expect(blockedMessage("ok")).toBeNull();
  });
});

describe("studioNotice", () => {
  const base = { trialEndsAt: inDays(14), paidUntil: null, suspendedReason: null };

  it("stays quiet for active studios and long trials", () => {
    expect(studioNotice({ ...base, status: "active" }, now)).toBeNull();
    expect(studioNotice({ ...base, status: "trialing" }, now)).toBeNull();
  });

  it("counts down the last week of a trial, with a link to plans", () => {
    const notice = studioNotice({ ...base, status: "trialing", trialEndsAt: inDays(3) }, now);
    expect(notice?.title).toBe("3 days left in your trial");
    expect(notice?.action?.href).toBe("/dashboard/billing");
    expect(studioNotice({ ...base, status: "trialing", trialEndsAt: inDays(0.5) }, now)?.title).toBe("1 day left in your trial");
  });

  it("says when the trial has ended", () => {
    expect(studioNotice({ ...base, status: "trialing", trialEndsAt: inDays(-1) }, now)).toMatchObject({ tone: "warning", title: "Your trial has ended" });
  });

  it("explains a suspension with the reason", () => {
    const notice = studioNotice({ ...base, status: "suspended", suspendedReason: "Payment failed." }, now);
    expect(notice?.tone).toBe("danger");
    expect(notice?.body).toMatch(/^Payment failed\. You can't start events/);
  });

  it("gives the date new work stops during the grace period", () => {
    const notice = studioNotice({ ...base, status: "active", paidUntil: "2026-10-30T12:00:00+05:30" }, now);
    expect(notice).toMatchObject({ tone: "warning", title: "Payment due" });
    expect(notice?.body).toContain("6 Nov 2026");
  });

  it("warns when payment is overdue", () => {
    expect(studioNotice({ ...base, status: "active", paidUntil: inDays(-10) }, now)?.tone).toBe("danger");
  });
});

describe("friendlyDbError", () => {
  it("passes through plan-limit and access messages only", () => {
    expect(friendlyDbError({ code: "P0001", hint: "plan_limit", message: "You've used 1 of 1 events" })).toBe("You've used 1 of 1 events");
    expect(friendlyDbError({ code: "42501", hint: "studio_access", message: "Your trial has ended." })).toBe("Your trial has ended.");
    expect(friendlyDbError({ code: "42501", message: "new row violates row-level security policy" })).toBeNull();
    expect(friendlyDbError(null)).toBeNull();
  });
});
