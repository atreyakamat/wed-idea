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

/**
 * Whether an event can move from one status to another. Going live needs a
 * locked design, so every guest's polaroid uses the couple's final version.
 */
export function checkTransition(from: EventStatus, to: EventStatus, designLocked: boolean): TransitionCheck {
  if (!TRANSITIONS[from].includes(to)) {
    return { allowed: false, reason: `A ${STATUS_LABELS[from].toLowerCase()} event can't move to ${STATUS_LABELS[to].toLowerCase()}.` };
  }
  if (to === "live" && !designLocked) {
    return { allowed: false, reason: "Lock the polaroid design before going live." };
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
