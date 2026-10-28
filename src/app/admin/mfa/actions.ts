"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/form";
import { mfaStep } from "@/lib/admin/mfa";
import { adminNext, parseTotpCode } from "@/lib/admin/next";
import { requireAdminUser } from "@/lib/admin/session";
import { formText } from "@/lib/form-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EnrolState = { error: string | null; factorId?: string; qrCode?: string; secret?: string };

const FRIENDLY_NAME = "Cute Wedding Polaroid admin";
const SETUP_CLOSED = "Authenticator setup is closed. Reopen it in SQL (see the README), then try again within the hour.";

/**
 * Starts authenticator-app setup. Only while setup is open and no
 * authenticator is registered. Half-finished setups are cleared first, so the
 * QR code shown always matches the factor being verified.
 */
export async function beginEnrolment(): Promise<EnrolState> {
  const { row } = await requireAdminUser();
  const supabase = await createClient();

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "Couldn't start setup. Try again." };
  const step = mfaStep(row, factors.totp.map((f) => f.id));
  if (step.kind === "closed") return { error: SETUP_CLOSED };
  if (step.kind === "verify") return { error: "An authenticator is already set up. Reload the page and enter its code." };

  for (const factor of factors.all) {
    if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: FRIENDLY_NAME, issuer: "Cute Wedding Polaroid" });
  if (error) return { error: "Couldn't start setup. Try again." };
  return { error: null, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Checks a 6-digit code and upgrades the session to aal2. During setup, a
 * correct code also registers the authenticator as this admin's own.
 */
export async function verifyCode(factorId: string, next: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { user, row } = await requireAdminUser();
  const code = parseTotpCode(formText(formData, "code"));
  if (!code) return { error: null, fieldErrors: { code: "Enter the 6-digit code from your authenticator app" } };

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "Couldn't check your code. Try again." };

  // Accept only the authenticator this page would offer: the registered one,
  // or, while setup is open, the one being set up right now.
  const step = mfaStep(row, factors.totp.map((f) => f.id));
  let registering: boolean;
  if (step.kind === "verify") {
    if (factorId !== step.factorId) return { error: "Reload the page and try again." };
    registering = step.registers;
  } else if (step.kind === "enrol") {
    if (!factors.all.some((f) => f.id === factorId && f.status === "unverified")) return { error: "Reload the page and try again." };
    registering = true;
  } else {
    return { error: SETUP_CLOSED };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { error: "That code didn't work. Use the newest code, and check your phone's clock is set automatically." };
  }

  if (registering) {
    const { error: saveError } = await createAdminClient()
      .from("admin_users")
      .update({ mfa_factor_id: factorId, mfa_setup_until: null })
      .eq("user_id", user.id);
    if (saveError) return { error: "Your code worked, but setup couldn't be saved. Reload and enter a new code." };
  }
  redirect(adminNext(next));
}
