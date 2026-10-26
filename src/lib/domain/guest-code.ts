// Guest codes look like "A17": one letter + two digits.
// I and O are left out so nobody confuses them with 1 and 0 when reading the
// code off a phone screen. Must match the check constraint on guests.code.
export const GUEST_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const GUEST_CODE_PATTERN = /^[A-HJ-NP-Z][0-9]{2}$/;
export const GUEST_CODE_CAPACITY = GUEST_CODE_LETTERS.length * 100;

export function isValidGuestCode(code: string): boolean {
  return GUEST_CODE_PATTERN.test(code);
}

/** Upper-cases and strips spaces so "a 17" typed by an operator becomes "A17". */
export function normalizeGuestCode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

function codeAt(index: number): string {
  const letter = GUEST_CODE_LETTERS[Math.floor(index / 100)];
  const digits = String(index % 100).padStart(2, "0");
  return `${letter}${digits}`;
}

/**
 * Picks an unused code for an event. Random rather than sequential so codes
 * can't be guessed by counting. Throws when every code is taken.
 */
export function pickGuestCode(
  taken: ReadonlySet<string>,
  random: () => number = Math.random,
): string {
  if (taken.size >= GUEST_CODE_CAPACITY) {
    throw new Error("No guest codes left for this event.");
  }

  // Random probes are fast while the event is mostly empty.
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = codeAt(Math.floor(random() * GUEST_CODE_CAPACITY));
    if (!taken.has(code)) return code;
  }

  // Nearly full: scan from a random start so we always terminate.
  const start = Math.floor(random() * GUEST_CODE_CAPACITY);
  for (let offset = 0; offset < GUEST_CODE_CAPACITY; offset++) {
    const code = codeAt((start + offset) % GUEST_CODE_CAPACITY);
    if (!taken.has(code)) return code;
  }

  throw new Error("No guest codes left for this event.");
}
