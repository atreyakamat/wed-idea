import type { StudioStatus } from "@/lib/auth";

export const STUDIO_STATUS_LABELS: Record<StudioStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment due",
  suspended: "Suspended",
};

export const SUSPENDED_MESSAGE = "This studio is suspended. Contact support to reactivate it.";

const DAY_MS = 86_400_000;

/** Whole days left until `endsAt`, rounded up; 0 once it has passed. */
export function daysLeft(endsAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / DAY_MS));
}

export type StudioNotice = { tone: "info" | "warning" | "danger"; title: string; body: string };

/** The banner a studio sees about its account, or null when all is well. */
export function studioNotice(
  studio: { status: StudioStatus; trialEndsAt: string; suspendedReason: string | null },
  now: Date = new Date(),
): StudioNotice | null {
  switch (studio.status) {
    case "suspended": {
      const reason = studio.suspendedReason?.trim().replace(/\.+$/, "");
      const rules = "You can't start events or capture until it's reactivated. Guests can still open their galleries.";
      return { tone: "danger", title: "Your studio is suspended", body: reason ? `${reason}. ${rules}` : rules };
    }
    case "past_due":
      return { tone: "warning", title: "Payment due", body: "Your last payment didn't go through. Settle it to keep your studio running." };
    case "trialing": {
      const days = daysLeft(studio.trialEndsAt, now);
      if (days === 0) return { tone: "warning", title: "Your trial has ended", body: "We'll be in touch about choosing a plan to keep running events." };
      if (days > 7) return null;
      return { tone: "info", title: `${days} day${days === 1 ? "" : "s"} left in your trial`, body: "We'll be in touch about choosing a plan before it ends." };
    }
    default:
      return null;
  }
}

/** True for the database's "studio is suspended" refusal. */
export function isSuspendedError(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "42501" && /suspended/i.test(error.message ?? "");
}
