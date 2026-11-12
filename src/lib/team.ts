// Team members and invites.
import type { MemberRole } from "@/lib/auth";

export const INVITE_TOKEN_PATTERN = /^[0-9a-f]{48}$/;
export const INVITE_ROLES = ["operator", "admin"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const ROLE_LABELS: Record<MemberRole, string> = { owner: "Owner", admin: "Admin", operator: "Team member" };
export const ROLE_HINTS: Record<InviteRole, string> = {
  operator: "Uploads, reviews and shares photos, and runs events.",
  admin: "Everything a team member can do, plus settings, invites and deleting.",
};

export function isInviteRole(value: unknown): value is InviteRole {
  return typeof value === "string" && (INVITE_ROLES as readonly string[]).includes(value);
}

export function inviteUrl(siteUrl: string, token: string): string {
  if (!INVITE_TOKEN_PATTERN.test(token)) throw new Error("Invalid invite token");
  let base = siteUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/invite/${token}`;
}

/** The WhatsApp message that carries an invite link. */
export function inviteMessage(studioName: string, role: InviteRole, url: string): string {
  return `You're invited to join ${studioName} as ${role === "admin" ? "an admin" : "a team member"}. Open this link to join (it works once, for 7 days):\n${url}`;
}
