"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/ui/form";
import { isStudioStatus } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/admin/session";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { formText } from "@/lib/form-data";
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
