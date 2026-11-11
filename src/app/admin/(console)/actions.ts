"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/lib/admin/session";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { createClient } from "@/lib/supabase/server";

/** Closes an upgrade request without changing the plan. */
export async function dismissRequest(requestId: string): Promise<void> {
  await requireAdmin();
  if (!UUID_PATTERN.test(requestId)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_dismiss_plan_request", { p_request: requestId });
  // Already handled (by another admin, or a payment) is fine: the list refreshes either way.
  if (error && error.code !== "22023") throw new Error("Couldn't dismiss the request. Try again.");
  refresh();
}
