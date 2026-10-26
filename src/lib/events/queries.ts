import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EventStatus } from "./status";

export type EventRow = {
  id: string;
  organization_id: string;
  slug: string;
  couple_names: string;
  venue: string | null;
  starts_at: string;
  ends_at: string;
  orders_open_at: string | null;
  orders_close_at: string | null;
  gallery_expires_at: string;
  status: EventStatus;
  theme: unknown;
  print_price_paise: number;
  max_copies_per_guest: number | null;
  budget_cap_paise: number | null;
  backdrop_brief: string | null;
};

const EVENT_COLUMNS =
  "id, organization_id, slug, couple_names, venue, starts_at, ends_at, orders_open_at, orders_close_at, gallery_expires_at, status, theme, print_price_paise, max_copies_per_guest, budget_cap_paise, backdrop_brief";

/** The studio's events, newest wedding first. RLS also limits rows to members. */
export async function listEvents(studioId: string): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("organization_id", studioId)
    .order("starts_at", { ascending: false });
  if (error) throw new Error(`Couldn't load events: ${error.message}`);
  return (data ?? []) as EventRow[];
}

/** One event in the studio, or null if it doesn't exist or isn't theirs. */
export async function getEvent(studioId: string, eventId: string): Promise<EventRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("organization_id", studioId)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the event: ${error.message}`);
  return data as EventRow | null;
}
