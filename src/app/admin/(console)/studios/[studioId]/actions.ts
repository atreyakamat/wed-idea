"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/ui/form";
import { isStudioStatus } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/admin/session";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { rupeesToPaise } from "@/lib/domain/money";
import { formatIstDate } from "@/lib/events/time";
import { formText } from "@/lib/form-data";
import { isManualMethod } from "@/lib/studio/payments";
import { STUDIO_STATUS_LABELS } from "@/lib/studio/status";
import { createClient } from "@/lib/supabase/server";

/** The admin functions raise readable messages for bad input (22023). */
function adminError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "22023") return error.message;
  if (error.code === "P0002") return "Studio not found.";
  return fallback;
}

export async function setStudioStatus(studioId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin(`/admin/studios/${studioId}`);
  if (!UUID_PATTERN.test(studioId)) return { error: "Studio not found." };

  const status = formText(formData, "status");
  const reason = formText(formData, "reason");
  if (!isStudioStatus(status)) return { error: null, fieldErrors: { status: "Choose a status" } };
  if (status === "suspended" && !reason) {
    return { error: null, fieldErrors: { reason: "Say why, so the studio and future you know" }, values: { status, reason } };
  }
  if (reason.length > 500) return { error: null, fieldErrors: { reason: "Keep it under 500 characters" }, values: { status, reason } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_studio_status", {
    p_org: studioId,
    p_status: status,
    p_reason: status === "suspended" ? reason : null,
  });
  if (error) return { error: adminError(error, "Couldn't change the status. Try again."), values: { status, reason } };

  refresh();
  return { error: null, success: `Status set to ${STUDIO_STATUS_LABELS[status]}.` };
}

const TRIAL_EXTENSIONS = new Set([7, 14, 30]);

export async function extendTrial(studioId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin(`/admin/studios/${studioId}`);
  if (!UUID_PATTERN.test(studioId)) return { error: "Studio not found." };

  const days = Number(formText(formData, "days"));
  if (!TRIAL_EXTENSIONS.has(days)) return { error: "Choose 7, 14 or 30 days." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_extend_trial", { p_org: studioId, p_days: days });
  if (error) return { error: adminError(error, "Couldn't extend the trial. Try again.") };

  refresh();
  return { error: null, success: `Trial extended by ${days} days.` };
}

const PLAN_ID = /^[a-z][a-z0-9-]{1,30}$/;

/** Moves a studio to another plan without a payment (complimentary, or a downgrade). */
export async function setPlan(studioId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin(`/admin/studios/${studioId}`);
  if (!UUID_PATTERN.test(studioId)) return { error: "Studio not found." };
  const plan = formText(formData, "plan");
  if (!PLAN_ID.test(plan)) return { error: "Choose a plan." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan", { p_org: studioId, p_plan: plan });
  if (error) return { error: adminError(error, "Couldn't change the plan. Try again.") };

  refresh();
  return { error: null, success: "Plan changed." };
}

const MONTH_CHOICES = new Set([1, 3, 6, 12]);

export async function recordPayment(studioId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin(`/admin/studios/${studioId}`);
  if (!UUID_PATTERN.test(studioId)) return { error: "Studio not found." };

  const values = { plan: formText(formData, "plan"), amount: formText(formData, "amount"), method: formText(formData, "method"), reference: formText(formData, "reference"), months: formText(formData, "months") };
  const fieldErrors: Record<string, string> = {};
  const amount = rupeesToPaise(values.amount);
  const months = Number(values.months);
  if (!PLAN_ID.test(values.plan)) fieldErrors.plan = "Choose a plan";
  if (!amount) fieldErrors.amount = "Enter the amount received, in rupees";
  if (!isManualMethod(values.method)) fieldErrors.method = "Choose how they paid";
  if (!MONTH_CHOICES.has(months)) fieldErrors.months = "Choose 1, 3, 6 or 12 months";
  if (values.reference.length > 120) fieldErrors.reference = "Keep it under 120 characters";
  if (Object.keys(fieldErrors).length || !amount) return { error: null, fieldErrors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_record_payment", {
    p_org: studioId,
    p_plan: values.plan,
    p_amount_paise: amount,
    p_method: values.method,
    p_reference: values.reference || null,
    p_months: months,
  });
  if (error) return { error: adminError(error, "Couldn't record the payment. Try again."), values };

  refresh();
  return { error: null, success: `Payment recorded. Paid until ${formatIstDate(String(data))}.` };
}
