export type EventStatus = "draft" | "live" | "closed" | "archived";

const TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ["live"],
  live: ["closed"],
  closed: ["live", "archived"],
  archived: ["closed"],
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  live: "Live",
  closed: "Closed",
  archived: "Archived",
};

/** Button wording for moving an event to each status. */
export const ACTION_LABELS: Record<EventStatus, string> = {
  draft: "Back to draft",
  live: "Go live",
  closed: "Close event",
  archived: "Archive",
};

export type TransitionCheck = { allowed: true } | { allowed: false; reason: string };

/** An event can go live from this long before it starts (the database enforces the same). */
export const GO_LIVE_EARLY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether an event can move from one status to another. Going live needs a
 * locked design, so every guest's polaroid uses the couple's final version,
 * and can happen at most a day before the event starts.
 */
export function checkTransition(
  from: EventStatus,
  to: EventStatus,
  designLocked: boolean,
  startsAt?: string,
  now: Date = new Date(),
): TransitionCheck {
  if (!TRANSITIONS[from].includes(to)) {
    return { allowed: false, reason: `A ${STATUS_LABELS[from].toLowerCase()} event can't move to ${STATUS_LABELS[to].toLowerCase()}.` };
  }
  if (to === "live" && !designLocked) {
    return { allowed: false, reason: "Lock the polaroid design before going live." };
  }
  if (to === "live" && startsAt && now.getTime() < new Date(startsAt).getTime() - GO_LIVE_EARLY_MS) {
    return { allowed: false, reason: "You can go live from a day before the event. For a test run, set its date to today." };
  }
  return { allowed: true };
}

export function nextStatuses(from: EventStatus): readonly EventStatus[] {
  return TRANSITIONS[from];
}

/** The design can only be unlocked while no guest has seen it yet. */
export function canUnlockDesign(status: EventStatus): boolean {
  return status === "draft";
}
