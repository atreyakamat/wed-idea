import type { StudioStatus } from "@/lib/auth";
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

/** One line describing an audit entry, for people rather than machines. */
export function describeAudit(action: string, details: Record<string, unknown>): string {
  switch (action) {
    case "studio.status_changed": {
      const line = `Changed status from ${statusLabel(details.from)} to ${statusLabel(details.to)}`;
      return typeof details.reason === "string" ? `${line}: ${details.reason}` : line;
    }
    case "studio.trial_extended":
      return `Extended the trial by ${Number(details.days)} day${Number(details.days) === 1 ? "" : "s"}`;
    default:
      return action;
  }
}
