import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CaptureGuest } from "./types";

type GuestRow = {
  id: string;
  code: string;
  phone_e164: string;
  name: string | null;
  access_token: string;
  link_sent_at: string | null;
  photos: { count: number }[];
};

export function toCaptureGuest(row: GuestRow): CaptureGuest {
  return {
    id: row.id,
    code: row.code,
    phone: row.phone_e164,
    name: row.name,
    accessToken: row.access_token,
    linkSentAt: row.link_sent_at,
    photoCount: row.photos?.[0]?.count ?? 0,
  };
}

export const GUEST_COLUMNS = "id, code, phone_e164, name, access_token, link_sent_at, photos(count)";

/** Most recent guests at an event, for the capture screen. RLS limits to members. */
export async function listRecentGuests(eventId: string, limit = 12): Promise<CaptureGuest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guests")
    .select(GUEST_COLUMNS)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't load guests: ${error.message}`);
  return (data as GuestRow[]).map(toCaptureGuest);
}

/** Guest and photo totals for an event. */
export async function eventCounts(eventId: string): Promise<{ guests: number; photos: number }> {
  const supabase = await createClient();
  const [guests, photos] = await Promise.all([
    supabase.from("guests").select("id", { count: "exact", head: true }).eq("event_id", eventId),
    supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", eventId).is("deleted_at", null),
  ]);
  return { guests: guests.count ?? 0, photos: photos.count ?? 0 };
}
