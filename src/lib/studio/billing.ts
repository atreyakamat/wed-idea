import "server-only";
import type { Studio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { istMonthRange } from "./month";
import { accessFor, type StudioAccess } from "./status";

export type Plan = {
  id: string;
  name: string;
  price_paise: number;
  events_per_month: number;
  photos_per_event: number;
  team_seats: number;
  gallery_days: number;
  remove_branding: boolean;
  is_trial: boolean;
  sort: number;
};

export type Payment = {
  id: string;
  created_at: string;
  plan_id: string;
  amount_paise: number;
  method: "upi" | "bank_transfer" | "cash" | "razorpay" | "other";
  reference: string | null;
  months: number;
  period_start: string;
  period_end: string;
};

export type OpenRequest = { id: string; plan_id: string; note: string | null; created_at: string };

export type Billing = {
  plans: Plan[];
  plan: Plan;
  access: StudioAccess;
  usage: { eventsThisMonth: number; monthLabel: string; members: number };
  payments: Payment[];
  openRequest: OpenRequest | null;
};

const PLAN_COLUMNS = "id, name, price_paise, events_per_month, photos_per_event, team_seats, gallery_days, remove_branding, is_trial, sort";

export async function listPlans(): Promise<Plan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plans").select(PLAN_COLUMNS).order("sort");
  if (error) throw new Error("Couldn't load plans.");
  return data;
}

/**
 * Everything the billing page shows. Payments and requests come back empty
 * for operators: row-level security limits them to owners and admins.
 */
export async function getBilling(studio: Studio): Promise<Billing> {
  const supabase = await createClient();
  const month = istMonthRange();
  const [plans, events, members, payments, request] = await Promise.all([
    listPlans(),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", studio.id)
      .gte("starts_at", month.start)
      .lt("starts_at", month.end),
    supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", studio.id),
    supabase
      .from("payments")
      .select("id, created_at, plan_id, amount_paise, method, reference, months, period_start, period_end")
      .eq("organization_id", studio.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("plan_requests").select("id, plan_id, note, created_at").eq("organization_id", studio.id).eq("status", "open").maybeSingle<OpenRequest>(),
  ]);
  if (events.error || members.error || payments.error || request.error) throw new Error("Couldn't load billing.");

  const plan = plans.find((p) => p.id === studio.planId);
  if (!plan) throw new Error("Your studio's plan is missing.");

  return {
    plans,
    plan,
    access: accessFor(studio),
    usage: { eventsThisMonth: events.count ?? 0, monthLabel: month.label, members: members.count ?? 0 },
    payments: (payments.data ?? []) as Payment[],
    openRequest: request.data,
  };
}
