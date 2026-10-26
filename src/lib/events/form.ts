import { z } from "zod";
import { isValidSlug } from "@/lib/domain/slug";
import { rupeesToPaise } from "@/lib/domain/money";
import { istInputToIso } from "./time";

export const DEFAULT_GALLERY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: Record<string, string>; values: Record<string, string> };

function read(formData: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, String(formData.get(n) ?? "").trim()]));
}

// ---------------------------------------------------------------------------
// Event details
// ---------------------------------------------------------------------------

export const DETAIL_FIELDS = [
  "couple_names",
  "slug",
  "venue",
  "starts_at",
  "ends_at",
  "orders_open_at",
  "orders_close_at",
  "gallery_days",
  "backdrop_brief",
] as const;

export type EventDetails = {
  couple_names: string;
  slug: string;
  venue: string | null;
  starts_at: string;
  ends_at: string;
  orders_open_at: string;
  orders_close_at: string;
  gallery_expires_at: string;
  backdrop_brief: string | null;
};

const detailsShape = z.object({
  couple_names: z.string().min(1, "Add the couple's names").max(120, "Keep it under 120 characters"),
  slug: z.string().refine(isValidSlug, "Use 3–60 lowercase letters, numbers and single dashes"),
  venue: z.string().max(160, "Keep it under 160 characters"),
  gallery_days: z.coerce
    .number({ error: "Enter a number of days" })
    .int("Use whole days")
    .min(1, "At least 1 day")
    .max(30, "At most 30 days"),
  backdrop_brief: z.string().max(2000, "Keep it under 2,000 characters"),
});

/**
 * Validates the event details form. Times are typed in India time. When the
 * order window is left blank it matches the event's start and end.
 */
export function parseEventDetails(formData: FormData): ParseResult<EventDetails> {
  const values = read(formData, DETAIL_FIELDS);
  const fieldErrors: Record<string, string> = {};

  const parsed = detailsShape.safeParse({ ...values, gallery_days: values.gallery_days || DEFAULT_GALLERY_DAYS });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  }

  const time = (name: (typeof DETAIL_FIELDS)[number], required: boolean) => {
    if (!values[name]) {
      if (required) fieldErrors[name] = "Pick a date and time";
      return null;
    }
    const iso = istInputToIso(values[name]);
    if (!iso) fieldErrors[name] = "Enter a valid date and time";
    return iso;
  };

  const startsAt = time("starts_at", true);
  const endsAt = time("ends_at", true);
  const opensAt = time("orders_open_at", false) ?? startsAt;
  const closesAt = time("orders_close_at", false) ?? endsAt;

  if (startsAt && endsAt && endsAt <= startsAt) fieldErrors.ends_at = "Must be after the start";
  // Only check the order window if one was typed; a blank window follows the
  // event times, whose own error is already shown.
  const customWindow = Boolean(values.orders_open_at || values.orders_close_at);
  if (customWindow && opensAt && closesAt && closesAt <= opensAt) fieldErrors.orders_close_at = "Must be after orders open";

  if (Object.keys(fieldErrors).length || !parsed.success || !startsAt || !endsAt || !opensAt || !closesAt) {
    return { ok: false, fieldErrors, values };
  }

  const galleryExpires = new Date(new Date(endsAt).getTime() + parsed.data.gallery_days * DAY_MS).toISOString();

  return {
    ok: true,
    data: {
      couple_names: parsed.data.couple_names,
      slug: parsed.data.slug,
      venue: parsed.data.venue || null,
      starts_at: startsAt,
      ends_at: endsAt,
      orders_open_at: opensAt,
      orders_close_at: closesAt,
      gallery_expires_at: galleryExpires,
      backdrop_brief: parsed.data.backdrop_brief || null,
    },
  };
}

/** Whole days between the event's end and when its photos are deleted. */
export function galleryDays(endsAt: string, galleryExpiresAt: string): number {
  return Math.max(1, Math.round((new Date(galleryExpiresAt).getTime() - new Date(endsAt).getTime()) / DAY_MS));
}

// ---------------------------------------------------------------------------
// Prints and limits
// ---------------------------------------------------------------------------

export const PRINT_FIELDS = ["print_price", "max_copies_per_guest", "budget_cap"] as const;

export type PrintSettings = {
  print_price_paise: number;
  max_copies_per_guest: number | null;
  budget_cap_paise: number | null;
};

const MAX_PRINT_PRICE_PAISE = 100_000; // Rs 1,000 per print is a sanity ceiling.

export function parsePrintSettings(formData: FormData): ParseResult<PrintSettings> {
  const values = read(formData, PRINT_FIELDS);
  const fieldErrors: Record<string, string> = {};

  const price = rupeesToPaise(values.print_price || "0");
  if (price === null) fieldErrors.print_price = "Enter an amount like 49 or 49.50";
  else if (price > MAX_PRINT_PRICE_PAISE) fieldErrors.print_price = "That's more than ₹1,000 a print — check the amount";

  let maxCopies: number | null = null;
  if (values.max_copies_per_guest) {
    const n = Number(values.max_copies_per_guest);
    if (!Number.isInteger(n) || n < 1 || n > 500) fieldErrors.max_copies_per_guest = "Use a whole number from 1 to 500";
    else maxCopies = n;
  }

  let cap: number | null = null;
  if (values.budget_cap) {
    cap = rupeesToPaise(values.budget_cap);
    if (cap === null || cap === 0) fieldErrors.budget_cap = "Enter an amount like 15000, or leave blank for no cap";
  }

  if (Object.keys(fieldErrors).length || price === null) return { ok: false, fieldErrors, values };
  return { ok: true, data: { print_price_paise: price, max_copies_per_guest: maxCopies, budget_cap_paise: cap } };
}
