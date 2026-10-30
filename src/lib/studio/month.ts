// Plan limits count events by the month of the event's date in India time,
// the same way the database does.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Start and end (exclusive) of the IST calendar month containing `at`, as ISO strings. */
export function istMonthRange(at: Date = new Date()): { start: string; end: string; label: string } {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS);
  const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)));
  return { start: start.toISOString(), end: end.toISOString(), label };
}
