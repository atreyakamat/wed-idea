// Event times are entered and shown in India time. India has no daylight
// saving, so a fixed +05:30 offset is exact all year.

export const IST_OFFSET = "+05:30";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-12-12T09:00" (a datetime-local value, in IST) -> ISO string, or null. */
export function istInputToIso(value: string): string | null {
  const m = LOCAL_INPUT.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  // Reject impossible dates like 31 February.
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59) {
    return null;
  }
  return new Date(probe.getTime() - IST_OFFSET_MS).toISOString();
}

/** ISO string -> "2026-12-12T09:00" in IST, for a datetime-local input. */
export function isoToIstInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 16);
}

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

const timeFormat = new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });

export function formatIstDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatIstDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatIstTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** "12 · 12 · 2026": the date line printed on polaroids, in IST. */
export function polaroidDate(iso: string): string {
  const [y, m, d] = isoToIstInput(iso).slice(0, 10).split("-");
  return `${d} · ${m} · ${y}`;
}
