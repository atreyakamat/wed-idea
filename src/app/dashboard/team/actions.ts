"use server";

import { refresh } from "next/cache";
import { requireStudio } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { publicEnv } from "@/lib/env";
import { allow } from "@/lib/rate-limit";
import { friendlyDbError } from "@/lib/studio/status";
import { createClient } from "@/lib/supabase/server";
import { inviteMessage, inviteUrl, isInviteRole } from "@/lib/team";

type Result = { error: string | null; success?: string };
export type InviteResult = { error: string | null; url?: string; message?: string };

export async function createInvite(role: string, label: string): Promise<InviteResult> {
  const { user, studio } = await requireStudio();
  if (!isInviteRole(role)) return { error: "Choose a role." };
  const name = label.trim().slice(0, 80);
  if (!(await allow(`invite:${user.id}`, 30, 60 * 60))) return { error: "That's a lot of invites. Try again in a while." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite", { p_org: studio.id, p_role: role, p_label: name || null });
  if (error || typeof data !== "string") return { error: friendlyDbError(error ?? {}) ?? "Couldn't make the invite. Try again." };
  const url = inviteUrl(publicEnv().NEXT_PUBLIC_SITE_URL, data);
  refresh();
  return { error: null, url, message: inviteMessage(studio.name, role, url) };
}

export async function cancelInvite(inviteId: string): Promise<Result> {
  const { studio } = await requireStudio();
  if (!UUID_PATTERN.test(inviteId)) return { error: "Invite not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("organization_invites").delete().eq("id", inviteId).eq("organization_id", studio.id).select("id");
  if (error || !data?.length) return { error: "Couldn't cancel that invite." };
  refresh();
  return { error: null, success: "Invite cancelled. Its link no longer works." };
}

export async function changeRole(userId: string, role: string): Promise<Result> {
  const { user, studio } = await requireStudio();
  if (!UUID_PATTERN.test(userId) || userId === user.id || !isInviteRole(role)) return { error: "Can't change that." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("organization_members").update({ role }).eq("organization_id", studio.id).eq("user_id", userId).neq("role", "owner").select("user_id");
  if (error || !data?.length) return { error: "Only the studio owner can change roles." };
  refresh();
  return { error: null, success: "Role updated." };
}

export async function removeMember(userId: string): Promise<Result> {
  const { user, studio } = await requireStudio();
  if (!UUID_PATTERN.test(userId) || userId === user.id) return { error: "Can't remove that person." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("organization_members").delete().eq("organization_id", studio.id).eq("user_id", userId).neq("role", "owner").select("user_id");
  if (error || !data?.length) return { error: "Only the studio owner can remove people." };
  refresh();
  return { error: null, success: "Removed from the studio." };
}
