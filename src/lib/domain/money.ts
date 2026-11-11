// All amounts are integer paise (1 rupee = 100 paise), matching the database.

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 123450 -> "₹1,234.5" */
export function formatInr(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`Paise must be a whole number, got ${paise}`);
  }
  return inr.format(paise / 100);
}

/** Largest amount the database stores: 2^31 - 1 paise. */
export const MAX_PAISE = 2_147_483_647;

/**
 * Parses a rupee amount typed by an admin ("49", "1,250.50") into paise.
 * Returns null for anything that isn't a valid non-negative amount.
 */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  // The database stores paise as a 32-bit integer (up to about ₹2.1 crore).
  return paise <= MAX_PAISE ? paise : null;
}
