// Phone numbers are stored in E.164 ("+919812345678"), matching the database.
const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Normalises what a guest types into E.164. Bare 10-digit numbers are
 * treated as Indian mobiles. Returns null if it can't be a valid number.
 *
 *   "98123 45678"      -> "+919812345678"
 *   "098123-45678"     -> "+919812345678"
 *   "+91 98123 45678"  -> "+919812345678"
 *   "+971 50 123 4567" -> "+971501234567"
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (!hasPlus) {
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;
    return `+91${digits}`;
  }

  const candidate = `+${digits}`;
  if (!E164.test(candidate)) return null;
  if (candidate.startsWith("+91") && !/^\+91[6-9][0-9]{9}$/.test(candidate)) {
    return null;
  }
  return candidate;
}
