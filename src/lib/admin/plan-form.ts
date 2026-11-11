import { rupeesToPaise } from "@/lib/domain/money";
import { formText } from "@/lib/form-data";

export type PlanInput = {
  name: string;
  price_paise: number;
  events_per_month: number;
  photos_per_event: number;
  team_seats: number;
  gallery_days: number;
  remove_branding: boolean;
};

const LIMITS: Record<keyof Omit<PlanInput, "name" | "price_paise" | "remove_branding">, [number, number, string]> = {
  events_per_month: [1, 1000, "events a month"],
  photos_per_event: [1, 100000, "photos per event"],
  team_seats: [1, 500, "seats"],
  gallery_days: [1, 365, "gallery days"],
};

/** Reads the plan editor form. Prices are typed in rupees and stored in paise. */
export function parsePlanForm(
  formData: FormData,
  isTrial: boolean,
): { ok: true; data: PlanInput } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const name = formText(formData, "name");
  if (!name || name.length > 40) fieldErrors.name = "Use 1 to 40 characters";

  const price = isTrial ? 0 : rupeesToPaise(formText(formData, "price"));
  if (price === null) fieldErrors.price = "Enter a price in rupees, like 1499";

  const numbers = {} as Record<keyof typeof LIMITS, number>;
  for (const [key, [min, max, label]] of Object.entries(LIMITS) as [keyof typeof LIMITS, [number, number, string]][]) {
    const raw = formText(formData, key);
    const n = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isInteger(n) || n < min || n > max) fieldErrors[key] = `Use ${min} to ${max.toLocaleString("en-IN")} ${label}`;
    numbers[key] = n;
  }

  if (Object.keys(fieldErrors).length || price === null) return { ok: false, fieldErrors };
  return { ok: true, data: { name, price_paise: price, ...numbers, remove_branding: formData.get("remove_branding") === "on" } };
}
