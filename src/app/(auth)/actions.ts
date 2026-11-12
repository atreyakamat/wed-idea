"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/form";
import { publicEnv } from "@/lib/env";
import { adminNext } from "@/lib/admin/next";
import { allow, clientIp } from "@/lib/rate-limit";
import { safeAppRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = readCredentials(formData);
  const parsed = credentials.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter your email and password.", values: { email: input.email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for every failure so the form doesn't reveal which emails exist.
    const unconfirmed = error.code === "email_not_confirmed";
    return {
      error: unconfirmed
        ? "Confirm your email first — check your inbox for the link."
        : "That email and password don't match an account.",
      values: { email: input.email },
    };
  }

  // A password sign-in is never two-step yet, so admin pages go straight to
  // the code screen (the proxy would send them there anyway).
  const target = safeAppRedirect(formData.get("next"));
  const isAdminPage = target === "/admin" || target.startsWith("/admin/") || target.startsWith("/admin?");
  redirect(isAdminPage ? `/admin/mfa?next=${encodeURIComponent(adminNext(target))}` : target);
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const input = readCredentials(formData);
  const parsed = credentials.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { error: null, fieldErrors, values: { email: input.email } };
  }

  // Someone joining through a team invite goes back to it, not to making a studio.
  const next = safeAppRedirect(formData.get("next"), "/onboarding");
  const after = next.startsWith("/invite/") ? next : "/onboarding";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(after)}` },
  });

  if (error) {
    const weak = error.code === "weak_password";
    return {
      error: weak ? "Choose a stronger password." : "Couldn't create your account. Try again in a minute.",
      values: { email: input.email },
    };
  }

  // With email confirmation on, there's no session until they click the link.
  if (!data.session) {
    return {
      error: null,
      success: `Almost there — we've sent a confirmation link to ${parsed.data.email}.`,
      values: { email: input.email },
    };
  }

  redirect(after);
}

const emailOnly = z.object({ email: z.email("Enter a valid email address") });

/**
 * Sends a password reset link. Always answers the same way, so the form
 * doesn't reveal which emails have accounts.
 */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = emailOnly.safeParse({ email });
  if (!parsed.success) return { error: null, fieldErrors: { email: "Enter a valid email address" }, values: { email } };

  const ip = await clientIp();
  const allowed = (await allow(`reset:ip:${ip}`, 10, 3600)) && (await allow(`reset:email:${parsed.data.email}`, 3, 3600));
  if (!allowed) return { error: "Too many reset requests. Try again in an hour, or check your inbox for the last link.", values: { email } };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });
  return {
    error: null,
    success: `If ${parsed.data.email} has an account, a reset link is on its way. It works for one hour.`,
    values: { email },
  };
}

const newPassword = z
  .object({ password: z.string().min(8, "Use at least 8 characters").max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match", path: ["confirm"] });

/** Sets a new password for the account signed in through a reset link. */
export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPassword.safeParse({ password: String(formData.get("password") ?? ""), confirm: String(formData.get("confirm") ?? "") });
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { error: null, fieldErrors };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your reset link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const same = error.code === "same_password";
    const weak = error.code === "weak_password";
    return { error: same ? "Choose a password you haven't used here before." : weak ? "Choose a stronger password." : "Couldn't save the password. Try again." };
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
