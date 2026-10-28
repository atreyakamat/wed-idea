/** What admin_users records about an admin's authenticator. */
export type AdminMfaRow = { mfa_factor_id: string | null; mfa_setup_until: string | null };

/** Setup is open only for a short window after an admin is added (or reset) in SQL. */
export function isSetupOpen(row: AdminMfaRow, now: Date = new Date()): boolean {
  return row.mfa_setup_until !== null && new Date(row.mfa_setup_until).getTime() > now.getTime();
}

export type MfaStep =
  | { kind: "verify"; factorId: string; registers: boolean }
  | { kind: "enrol" }
  | { kind: "closed" };

/**
 * Which screen the two-step page shows.
 * - A registered authenticator: ask for its code.
 * - None registered and setup open: finish with an existing one, or set one up.
 * - None registered and setup closed: nothing to do here; reopen it in SQL.
 */
export function mfaStep(row: AdminMfaRow, verifiedFactorIds: string[], now: Date = new Date()): MfaStep {
  if (row.mfa_factor_id && verifiedFactorIds.includes(row.mfa_factor_id)) {
    return { kind: "verify", factorId: row.mfa_factor_id, registers: false };
  }
  if (!isSetupOpen(row, now)) return { kind: "closed" };
  const [existing] = verifiedFactorIds;
  return existing ? { kind: "verify", factorId: existing, registers: true } : { kind: "enrol" };
}
