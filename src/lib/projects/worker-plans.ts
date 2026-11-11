import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkerPlan = { id: string; name: string; photos_per_event: number };

/** The studio's plan, read with the worker's (service-role) client. */
export async function listPlansWith(supabase: SupabaseClient, planId: string): Promise<WorkerPlan | null> {
  const { data } = await supabase.from("plans").select("id, name, photos_per_event").eq("id", planId).maybeSingle<WorkerPlan>();
  return data;
}
