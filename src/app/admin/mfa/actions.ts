"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/form";
import { adminNext, parseTotpCode } from "@/lib/admin/next";
import { requireAdminUser } from "@/lib/admin/session";
import { formText } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";

export type EnrolState = { error: string | null; factorId?: string; qrCode?: string; secret?: string };

const FRIENDLY_NAME = "Cute Wedding Polaroid admin";

/**
 * Starts authenticator-app setup. Any half-finished setup is cleared first,
 * so the QR code shown always matches the factor being verified.
 */
export async function beginEnrolment(): Promise<EnrolState> {
  await requireAdminUser();
  const supabase = await createClient();

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "Couldn't start setup. Try again." };
  if (factors.totp.length > 0) return { error: "An authenticator is already set up. Reload the page and enter its code." };

  for (const factor of factors.all) {
    if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: FRIENDLY_NAME, issuer: "Cute Wedding Polaroid" });
  if (error) return { error: "Couldn't start setup. Try again." };
  return { error: null, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks a 6-digit code and upgrades the session to aal2. */
export async function verifyCode(factorId: string, next: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminUser();
  const code = parseTotpCode(formText(formData, "code"));
  if (!code) return { error: null, fieldErrors: { code: "Enter the 6-digit code from your authenticator app" } };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    return { error: "That code didn't work. Use the newest code, and check your phone's clock is set automatically." };
  }
  redirect(adminNext(next));
}
