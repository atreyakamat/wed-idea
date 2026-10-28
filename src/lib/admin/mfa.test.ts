import { describe, expect, it } from "vitest";
import { isSetupOpen, mfaStep } from "./mfa";

const now = new Date("2026-11-01T10:00:00Z");
const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000).toISOString();

describe("isSetupOpen", () => {
  it("is open until the window ends", () => {
    expect(isSetupOpen({ mfa_factor_id: null, mfa_setup_until: inMinutes(30) }, now)).toBe(true);
    expect(isSetupOpen({ mfa_factor_id: null, mfa_setup_until: inMinutes(-1) }, now)).toBe(false);
    expect(isSetupOpen({ mfa_factor_id: null, mfa_setup_until: null }, now)).toBe(false);
  });
});

describe("mfaStep", () => {
  it("asks for the registered authenticator's code", () => {
    expect(mfaStep({ mfa_factor_id: "f1", mfa_setup_until: null }, ["f1"], now)).toEqual({ kind: "verify", factorId: "f1", registers: false });
  });

  it("never offers a different authenticator than the registered one", () => {
    expect(mfaStep({ mfa_factor_id: "f1", mfa_setup_until: null }, ["f2"], now)).toEqual({ kind: "closed" });
  });

  it("offers setup only while the window is open", () => {
    expect(mfaStep({ mfa_factor_id: null, mfa_setup_until: inMinutes(30) }, [], now)).toEqual({ kind: "enrol" });
    expect(mfaStep({ mfa_factor_id: null, mfa_setup_until: inMinutes(-5) }, [], now)).toEqual({ kind: "closed" });
    expect(mfaStep({ mfa_factor_id: null, mfa_setup_until: null }, [], now)).toEqual({ kind: "closed" });
  });

  it("finishes registering an authenticator that is already verified", () => {
    expect(mfaStep({ mfa_factor_id: null, mfa_setup_until: inMinutes(30) }, ["f9"], now)).toEqual({ kind: "verify", factorId: "f9", registers: true });
  });

  it("lets a reset admin set up again after the old authenticator is deleted", () => {
    expect(mfaStep({ mfa_factor_id: "old", mfa_setup_until: inMinutes(30) }, [], now)).toEqual({ kind: "enrol" });
  });
});
