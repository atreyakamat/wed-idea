"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/ui/form";
import { requireStudioManager } from "@/lib/auth";
import { formText } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";

/** Asks to move to a paid plan. One open request per studio; asking again replaces it. */
export async function requestPlan(planId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { studio } = await requireStudioManager();
  const note = formText(formData, "note");
  if (note.length > 500) return { error: null, fieldErrors: { note: "Keep it under 500 characters" }, values: { note } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_plan", { p_org: studio.id, p_plan: planId, p_note: note || null });
  if (error) return { error: error.code === "22023" ? error.message : "Couldn't send your request. Try again.", values: { note } };

  refresh();
  return { error: null, success: "Request sent. We'll get in touch to set up payment." };
}
