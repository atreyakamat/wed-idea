import "server-only";
import type { MemberRole, StudioStatus } from "@/lib/auth";
import type { EventStatus } from "@/lib/events/status";
import type { Plan } from "@/lib/studio/billing";
import type { PaymentMethod } from "@/lib/studio/payments";
import type { StudioAccess } from "@/lib/studio/status";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./session";

// Every read goes through requireAdmin() here and through is_admin() in the
// database functions, so admin data is checked twice.

export type AdminOverview = {
  studios: {
    total: number;
    trialing: number;
    active: number;
    past_due: number;
    suspended: number;
    trials_ending_7d: number;
    trials_ended: number;
    new_30d: number;
  };
  revenue: { mrr_paise: number; received_30d_paise: number };
  open_requests: number;
  events: { total: number; draft: number; live: number; closed: number; archived: number };
  guests: number;
  photos: number;
  storage_bytes: number;
  signups_by_week: { week: string; studios: number }[];
};

export type AdminStudio = {
  id: string;
  name: string;
  slug: string;
  status: StudioStatus;
  access: StudioAccess;
  plan_id: string;
  plan_name: string;
  paid_until: string | null;
  trial_ends_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  owner_email: string | null;
  member_count: number;
  event_count: number;
  live_event_count: number;
  guest_count: number;
  photo_count: number;
  storage_bytes: number;
};

export type AdminMember = { user_id: string; email: string | null; role: MemberRole; created_at: string };

export type AdminEvent = {
  id: string;
  couple_names: string;
  slug: string;
  status: EventStatus;
  starts_at: string;
  venue: string | null;
  organization_id: string;
  studio_name: string;
  guest_count: number;
  photo_count: number;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  created_at: string;
  action: string;
  actor_email: string | null;
  organization_id: string | null;
  studio_name: string | null;
  details: Record<string, unknown>;
};

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`Couldn't load admin data (${fn}).`);
  return data as T;
}

/** Postgres bigint counts can arrive as strings; make them numbers. */
function numbers<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
  const out = { ...row };
  for (const key of keys) out[key] = Number(row[key] ?? 0) as T[keyof T];
  return out;
}

const STUDIO_COUNTS: (keyof AdminStudio)[] = ["member_count", "event_count", "live_event_count", "guest_count", "photo_count", "storage_bytes"];

export const getOverview = () => rpc<AdminOverview>("admin_overview");

export async function listStudios(filters: { query?: string; status?: StudioStatus } = {}): Promise<AdminStudio[]> {
  const rows = await rpc<AdminStudio[]>("admin_studios", { p_query: filters.query || null, p_status: filters.status ?? null });
  return rows.map((r) => numbers(r, STUDIO_COUNTS));
}

export async function getStudio(id: string): Promise<AdminStudio | null> {
  const rows = await rpc<AdminStudio[]>("admin_studios", { p_org: id });
  return rows[0] ? numbers(rows[0], STUDIO_COUNTS) : null;
}

export const listMembers = (studioId: string) => rpc<AdminMember[]>("admin_studio_members", { p_org: studioId });

export async function listEvents(filters: { status?: EventStatus; query?: string; studioId?: string } = {}): Promise<AdminEvent[]> {
  const rows = await rpc<AdminEvent[]>("admin_events", {
    p_status: filters.status ?? null,
    p_query: filters.query || null,
    p_org: filters.studioId ?? null,
  });
  return rows.map((r) => numbers(r, ["guest_count", "photo_count"]));
}

export async function listAudit(filters: { studioId?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const rows = await rpc<AuditEntry[]>("admin_audit_entries", { p_org: filters.studioId ?? null, p_limit: filters.limit ?? 100 });
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export type AdminPayment = {
  id: string;
  created_at: string;
  organization_id: string;
  studio_name: string;
  plan_name: string;
  amount_paise: number;
  method: PaymentMethod;
  reference: string | null;
  months: number;
  period_start: string;
  period_end: string;
  recorded_by_email: string | null;
};

export type PlanRequest = {
  id: string;
  created_at: string;
  organization_id: string;
  studio_name: string;
  current_plan: string;
  plan_id: string;
  plan_name: string;
  note: string | null;
  requested_by_email: string | null;
};

export const listPayments = (filters: { studioId?: string; limit?: number } = {}) =>
  rpc<AdminPayment[]>("admin_payments", { p_org: filters.studioId ?? null, p_limit: filters.limit ?? 100 });

export const listPlanRequests = () => rpc<PlanRequest[]>("admin_plan_requests");

/** All plans, for the editor and pickers. Plans are public, but this page is admin-only. */
export async function listAllPlans(): Promise<Plan[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, price_paise, events_per_month, photos_per_event, team_seats, gallery_days, remove_branding, is_trial, sort")
    .order("sort");
  if (error) throw new Error("Couldn't load plans.");
  return data;
}
