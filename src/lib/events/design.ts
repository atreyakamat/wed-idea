import { DEFAULT_FILTER_ID } from "@/lib/polaroid/filters";
import { TEMPLATES } from "@/lib/polaroid/templates";
import { eventThemeSchema, type EventTheme } from "@/lib/polaroid/theme";
import { polaroidDate } from "./time";

type EventForDesign = {
  couple_names: string;
  starts_at: string;
  venue: string | null;
  theme: unknown;
};

/** Starting design for an event with nothing saved yet. */
export function defaultTheme(event: Omit<EventForDesign, "theme">): EventTheme {
  return {
    templateId: TEMPLATES[0].id,
    palette: {},
    text: {
      names: event.couple_names.slice(0, 40).trim(),
      date: polaroidDate(event.starts_at),
      place: event.venue ? event.venue.slice(0, 30).trim() : undefined,
    },
    filterId: DEFAULT_FILTER_ID,
    lockedAt: null,
  };
}

/** The saved design if it's valid, otherwise a sensible default. */
export function themeForEvent(event: EventForDesign): EventTheme {
  const saved = eventThemeSchema.safeParse(event.theme);
  return saved.success ? saved.data : defaultTheme(event);
}

export function isDesignLocked(theme: unknown): boolean {
  const saved = eventThemeSchema.safeParse(theme);
  return saved.success && saved.data.lockedAt !== null;
}
