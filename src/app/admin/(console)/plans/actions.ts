"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/ui/form";
import { parsePlanForm } from "@/lib/admin/plan-form";
import { requireAdmin } from "@/lib/admin/session";
import { createClient } from "@/lib/supabase/server";

export async function updatePlan(planId: string, isTrial: boolean, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin("/admin/plans");
  const values = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  const parsed = parsePlanForm(formData, isTrial);
  if (!parsed.ok) return { error: null, fieldErrors: parsed.fieldErrors, values };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan", {
    p_id: planId,
    p_name: parsed.data.name,
    p_price_paise: parsed.data.price_paise,
    p_events_per_month: parsed.data.events_per_month,
    p_photos_per_event: parsed.data.photos_per_event,
    p_team_seats: parsed.data.team_seats,
    p_gallery_days: parsed.data.gallery_days,
    p_remove_branding: parsed.data.remove_branding,
  });
  if (error) return { error: error.code === "22023" ? error.message : "Couldn't save the plan. Try again.", values };

  refresh();
  return { error: null, success: `${parsed.data.name} saved.` };
}
