import type { StudioStatus } from "@/lib/auth";
import { formatInr } from "@/lib/domain/money";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/studio/payments";
import { STUDIO_STATUS_LABELS } from "@/lib/studio/status";

const STUDIO_STATUSES = new Set<string>(["trialing", "active", "past_due", "suspended"]);

export function isStudioStatus(value: unknown): value is StudioStatus {
  return typeof value === "string" && STUDIO_STATUSES.has(value);
}

/** 350000 -> "342 KB", 1.5e9 -> "1.4 GB". Binary units, one decimal above MB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  const digits = exp >= 2 && value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[exp]}`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

const statusLabel = (value: unknown) => (isStudioStatus(value) ? STUDIO_STATUS_LABELS[value] : String(value));
const planLabel = (value: unknown) => {
  const id = String(value ?? "");
  return id.charAt(0).toUpperCase() + id.slice(1);
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "price ₹1,499 → ₹1,599, seats 3 → 4" for the fields that changed. */
function planChanges(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    name: "name",
    price_paise: "price",
    events_per_month: "events a month",
    photos_per_event: "photos per event",
    team_seats: "seats",
    gallery_days: "gallery days",
    remove_branding: "branding removed",
  };
  const show = (key: string, v: unknown) => (key === "price_paise" ? formatInr(Number(v)) : String(v));
  const changed = Object.keys(labels).filter((k) => before[k] !== after[k]);
  return changed.map((k) => `${labels[k]} ${show(k, before[k])} → ${show(k, after[k])}`).join(", ");
}

/** One line describing an audit entry, for people rather than machines. */
export function describeAudit(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case "studio.status_changed": {
      const line = `Changed status from ${statusLabel(details.from)} to ${statusLabel(details.to)}`;
      return typeof details.reason === "string" ? `${line}: ${details.reason}` : line;
    }
    case "studio.trial_extended":
      return `Extended the trial by ${plural(Number(details.days), "day")}`;
    case "studio.plan_changed":
      return `Changed plan from ${planLabel(details.from)} to ${planLabel(details.to)}`;
    case "studio.payment_recorded": {
      const method = PAYMENT_METHOD_LABELS[details.method as PaymentMethod] ?? String(details.method);
      const ref = typeof details.reference === "string" ? ` (${details.reference})` : "";
      return `Recorded ${formatInr(Number(details.amount_paise))} by ${method}${ref} for ${planLabel(details.plan)}, ${plural(Number(details.months), "month")}`;
    }
    case "plan_request.dismissed":
      return "Dismissed an upgrade request";
    case "plan.updated": {
      const changes = planChanges((details.before ?? {}) as Record<string, unknown>, (details.after ?? {}) as Record<string, unknown>);
      const base = `Edited the ${planLabel(details.plan)} plan`;
      return changes ? `${base}: ${changes}` : base;
    }
    default:
      return action;
  }
}

/** What an audit entry is about: a studio, or the platform itself (plan edits). */
export function auditSubject(entry: { organization_id: string | null; studio_name: string | null }): string {
  if (!entry.organization_id) return "Platform";
  return entry.studio_name ?? "Deleted studio";
}
