import type { StudioStatus } from "@/lib/auth";
import { formatIstDate } from "@/lib/events/time";

export const STUDIO_STATUS_LABELS: Record<StudioStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment due",
  suspended: "Suspended",
};

/**
 * What a studio may do right now. Mirrors public.access_for() in the
 * database, which is what actually enforces it; this copy is for display.
 *   ok, payment_due                    everything
 *   trial_ended, payment_overdue       no new events or going live; live events finish
 *   suspended                          nothing new at all
 */
export type StudioAccess = "ok" | "payment_due" | "trial_ended" | "payment_overdue" | "suspended";

export const PAYMENT_GRACE_DAYS = 7;
const DAY_MS = 86_400_000;
/** After access runs out, a live event keeps capturing this long after it ends… */
export const CAPTURE_GRACE_MS = 12 * 60 * 60 * 1000;
/** …but never longer than this after access ran out. */
export const CAPTURE_CAP_MS = 3 * DAY_MS;

export const SUSPENDED_MESSAGE = "This studio is suspended. Contact support to reactivate it.";
export const TRIAL_ENDED_MESSAGE = "Your trial has ended. Choose a plan to start new events.";
export const OVERDUE_MESSAGE = "Your payment is overdue. Settle it to start new events.";

type AccountFields = { status: StudioStatus; trialEndsAt: string; paidUntil: string | null };

export function accessFor({ status, trialEndsAt, paidUntil }: AccountFields, now: Date = new Date()): StudioAccess {
  const t = now.getTime();
  if (status === "suspended") return "suspended";
  if (status === "trialing") return new Date(trialEndsAt).getTime() <= t ? "trial_ended" : "ok";
  if (paidUntil === null) return status === "past_due" ? "payment_overdue" : "ok";
  const paid = new Date(paidUntil).getTime();
  if (paid + PAYMENT_GRACE_DAYS * DAY_MS <= t) return "payment_overdue";
  if (paid <= t || status === "past_due") return "payment_due";
  return "ok";
}

/** Can the studio create events and go live? */
export function canStartWork(access: StudioAccess): boolean {
  return access === "ok" || access === "payment_due";
}

/** When a blocked studio's access ran out (mirrors access_ended_at), or null. */
export function accessEndedAt(fields: AccountFields, now: Date = new Date()): number | null {
  const access = accessFor(fields, now);
  if (access === "trial_ended") return new Date(fields.trialEndsAt).getTime();
  if (access === "payment_overdue") {
    return fields.paidUntil ? new Date(fields.paidUntil).getTime() + PAYMENT_GRACE_DAYS * DAY_MS : new Date(fields.trialEndsAt).getTime();
  }
  return null;
}

/**
 * Can photos be taken at this event right now? Mirrors capture_open() in the
 * database: always while access is fine; after it runs out, only at a live
 * event, until 12 hours after it ends and at most 3 days after access ran out.
 */
export function canCapture(fields: AccountFields, event: { status: string; endsAt: string }, now: Date = new Date()): boolean {
  const access = accessFor(fields, now);
  if (access === "suspended") return false;
  if (canStartWork(access)) return true;
  const ended = accessEndedAt(fields, now) ?? now.getTime();
  const until = Math.min(new Date(event.endsAt).getTime() + CAPTURE_GRACE_MS, ended + CAPTURE_CAP_MS);
  return event.status === "live" && now.getTime() <= until;
}

/** Why new work is blocked, in the same words the database uses. */
export function blockedMessage(access: StudioAccess): string | null {
  if (access === "suspended") return SUSPENDED_MESSAGE;
  if (access === "trial_ended") return TRIAL_ENDED_MESSAGE;
  if (access === "payment_overdue") return OVERDUE_MESSAGE;
  return null;
}

/** Whole days left until `endsAt`, rounded up; 0 once it has passed. */
export function daysLeft(endsAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / DAY_MS));
}

export type StudioNotice = {
  tone: "info" | "warning" | "danger";
  title: string;
  body: string;
  action?: { href: string; label: string };
};

const BILLING = { href: "/dashboard/billing", label: "See plans" };

/** The banner a studio sees about its account, or null when all is well. */
export function studioNotice(studio: AccountFields & { suspendedReason: string | null }, now: Date = new Date()): StudioNotice | null {
  const access = accessFor(studio, now);
  switch (access) {
    case "suspended": {
      const reason = studio.suspendedReason?.trim().replace(/\.+$/, "");
      const rules = "You can't start events or capture until it's reactivated. Guests can still open their galleries.";
      return { tone: "danger", title: "Your studio is suspended", body: reason ? `${reason}. ${rules}` : rules };
    }
    case "trial_ended":
      return {
        tone: "warning",
        title: "Your trial has ended",
        body: "Choose a plan to start new events. Events that are already live can finish.",
        action: BILLING,
      };
    case "payment_overdue":
      return {
        tone: "danger",
        title: "Your payment is overdue",
        body: "New events are paused until it's settled. Events that are already live can finish.",
        action: { href: "/dashboard/billing", label: "Billing" },
      };
    case "payment_due": {
      const lockDate = studio.paidUntil ? formatIstDate(new Date(new Date(studio.paidUntil).getTime() + PAYMENT_GRACE_DAYS * DAY_MS).toISOString()) : null;
      return {
        tone: "warning",
        title: "Payment due",
        body: lockDate ? `Your plan has run out. Settle it by ${lockDate} to keep starting new events.` : "Settle your payment to keep starting new events.",
        action: { href: "/dashboard/billing", label: "Billing" },
      };
    }
    default: {
      if (studio.status !== "trialing") return null;
      const days = daysLeft(studio.trialEndsAt, now);
      if (days > 7) return null;
      return { tone: "info", title: `${days} day${days === 1 ? "" : "s"} left in your trial`, body: "Choose a plan before it ends to keep starting new events.", action: BILLING };
    }
  }
}

type DbError = { code?: string; message?: string; hint?: string | null } | null | undefined;

/**
 * The database's own message for a plan limit, access or event-rule refusal, written to
 * be shown as-is. Null for any other error.
 */
export function friendlyDbError(error: DbError): string | null {
  if (!error?.message) return null;
  return error.hint === "plan_limit" || error.hint === "studio_access" || error.hint === "event_rule" ? error.message : null;
}
