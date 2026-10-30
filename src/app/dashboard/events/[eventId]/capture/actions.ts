"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStudio } from "@/lib/auth";
import { photoPaths, UUID_PATTERN } from "@/lib/capture/photos";
import { GUEST_COLUMNS, toCaptureGuest } from "@/lib/capture/queries";
import type { StartGuestState } from "@/lib/capture/types";
import { pickGuestCode } from "@/lib/domain/guest-code";
import { normalizePhone } from "@/lib/domain/phone";
import { getEvent } from "@/lib/events/queries";
import { formText } from "@/lib/form-data";
import { accessFor, blockedMessage, canCapture, friendlyDbError } from "@/lib/studio/status";
import { createClient } from "@/lib/supabase/server";

type GuestRow = Parameters<typeof toCaptureGuest>[0];

/**
 * Any studio member (operators included) can capture, but only at a live
 * event, and only while the studio's plan allows it (a live wedding always
 * finishes, unless the studio is suspended).
 */
async function liveEvent(eventId: string) {
  const { user, studio } = await requireStudio();
  const event = await getEvent(studio.id, eventId);
  if (!event) throw new Error("Event not found.");
  if (event.status !== "live") throw new Error("This event isn't live, so capture is closed.");
  if (!canCapture(studio, { status: event.status, endsAt: event.ends_at })) {
    throw new Error(blockedMessage(accessFor(studio)) ?? "Capture is closed.");
  }
  return { user, studio, event };
}

function parseGuestForm(formData: FormData) {
  const values = { phone: formText(formData, "phone"), name: formText(formData, "name") };
  const fieldErrors: Record<string, string> = {};
  const phone = normalizePhone(values.phone);
  if (!phone) fieldErrors.phone = "Enter a WhatsApp number, like 98123 45678";
  if (values.name.length > 120) fieldErrors.name = "Keep the name under 120 characters";
  if (formData.get("consent") !== "on") fieldErrors.consent = "The guest needs to agree first";
  return { values, phone, fieldErrors };
}

async function findGuest(supabase: SupabaseClient, eventId: string, phone: string) {
  const { data, error } = await supabase
    .from("guests")
    .select(GUEST_COLUMNS)
    .eq("event_id", eventId)
    .eq("phone_e164", phone)
    .maybeSingle<GuestRow>();
  if (error) throw new Error("Couldn't look up the guest. Try again.");
  return data;
}

/** Updates the guest's name if a new one was typed; keeps the old row otherwise. */
async function refreshName(supabase: SupabaseClient, row: GuestRow, name: string): Promise<GuestRow> {
  if (!name || name === row.name) return row;
  const { data, error } = await supabase.from("guests").update({ name }).eq("id", row.id).select(GUEST_COLUMNS).single<GuestRow>();
  return error ? row : data;
}

/**
 * Inserts a new guest with an unused code. Retries when two operators race:
 * either for the same code, or for the same phone number (then the existing
 * guest is returned).
 */
async function createGuest(
  supabase: SupabaseClient,
  eventId: string,
  phone: string,
  name: string,
): Promise<{ row: GuestRow; returning: boolean }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await supabase.from("guests").select("code").eq("event_id", eventId);
    if (taken.error) break;

    const code = pickGuestCode(new Set(taken.data.map((g) => g.code)));
    const inserted = await supabase
      .from("guests")
      .insert({ event_id: eventId, code, phone_e164: phone, name: name || null, consent_at: new Date().toISOString() })
      .select(GUEST_COLUMNS)
      .single<GuestRow>();

    if (!inserted.error) return { row: inserted.data, returning: false };
    const friendly = friendlyDbError(inserted.error);
    if (friendly) throw new Error(friendly);
    if (inserted.error.code !== "23505") break;

    const existing = await findGuest(supabase, eventId, phone);
    if (existing) return { row: existing, returning: true };
  }
  throw new Error("Couldn't create the guest. Try again.");
}

/**
 * Starts (or resumes) a guest by WhatsApp number. Returning guests keep
 * their code and gallery link; new guests get a fresh code.
 */
export async function startGuest(eventId: string, _prev: StartGuestState, formData: FormData): Promise<StartGuestState> {
  const { values, phone, fieldErrors } = parseGuestForm(formData);
  if (Object.keys(fieldErrors).length || !phone) return { error: null, fieldErrors, values };

  try {
    const { event } = await liveEvent(eventId);
    const supabase = await createClient();
    const existing = await findGuest(supabase, event.id, phone);
    if (existing) {
      const row = await refreshName(supabase, existing, values.name);
      return { error: null, guest: toCaptureGuest(row), returning: true };
    }
    const created = await createGuest(supabase, event.id, phone, values.name);
    return { error: null, guest: toCaptureGuest(created.row), returning: created.returning };
  } catch (e) {
    return { error: (e as Error).message, values };
  }
}

/**
 * Records a photo after the browser has uploaded its two files. Paths are
 * rebuilt here from ids, never taken from the client.
 */
export async function savePhoto(
  eventId: string,
  input: { guestId: string; photoId: string; width: number; height: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, studio, event } = await liveEvent(eventId);
  if (!UUID_PATTERN.test(input.guestId) || !UUID_PATTERN.test(input.photoId)) return { ok: false, error: "Invalid photo." };
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1) {
    return { ok: false, error: "Invalid photo size." };
  }

  const paths = photoPaths(studio.id, event.id, input.guestId, input.photoId);
  const supabase = await createClient();

  // The upload must actually exist before we record it.
  const folder = paths.full.slice(0, paths.full.lastIndexOf("/"));
  const listed = await supabase.storage.from("event-photos").list(folder, { search: input.photoId });
  const names = new Set((listed.data ?? []).map((f) => f.name));
  if (!names.has(`${input.photoId}.jpg`) || !names.has(`${input.photoId}.thumb.jpg`)) {
    return { ok: false, error: "Upload didn't finish. Try that photo again." };
  }

  const { error } = await supabase.from("photos").insert({
    id: input.photoId,
    event_id: event.id,
    guest_id: input.guestId,
    storage_path: paths.full,
    thumb_path: paths.thumb,
    width: input.width,
    height: input.height,
    created_by: user.id,
  });
  if (error && error.code !== "23505") return { ok: false, error: friendlyDbError(error) ?? "Couldn't save the photo. Try again." };
  return { ok: true };
}

export async function markLinkSent(eventId: string, guestId: string): Promise<void> {
  const { event } = await liveEvent(eventId);
  if (!UUID_PATTERN.test(guestId)) return;
  const supabase = await createClient();
  await supabase.from("guests").update({ link_sent_at: new Date().toISOString() }).eq("id", guestId).eq("event_id", event.id);
}
