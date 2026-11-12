"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { allow } from "@/lib/rate-limit";
import { friendlyDbError } from "@/lib/studio/status";
import { createClient } from "@/lib/supabase/server";
import { INVITE_TOKEN_PATTERN } from "@/lib/team";

export async function acceptInvite(token: string): Promise<{ error: string }> {
  if (!INVITE_TOKEN_PATTERN.test(token)) return { error: "This invite link isn't valid." };
  const user = await requireUser(`/invite/${token}`);
  if (!(await allow(`invite-accept:${user.id}`, 20, 60 * 60))) return { error: "Too many tries. Wait a while and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) return { error: friendlyDbError(error) ?? (error.code === "22023" ? error.message : "Couldn't join the studio. Try again.") };
  redirect("/dashboard");
}
