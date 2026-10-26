"use server";

import { requireStudio } from "@/lib/auth";
import { photoPaths, UUID_PATTERN } from "@/lib/capture/photos";
import { GUEST_COLUMNS, toCaptureGuest } from "@/lib/capture/queries";
import type { StartGuestState } from "@/lib/capture/types";
import { pickGuestCode } from "@/lib/domain/guest-code";
import { normalizePhone } from "@/lib/domain/phone";
import { getEvent } from "@/lib/events/queries";
import { createClient } from "@/lib/supabase/server";

/** Any studio member (operators included) can capture, but only at a live event. */
async function liveEvent(eventId: string) {
  const { user, studio } = await requireStudio();
  const event = await getEvent(studio.id, eventId);
  if (!event) throw new Error("Event not found.");
  if (event.status !== "live") throw new Error("This event isn't live, so capture is closed.");
  return { user, studio, event };
}

/**
 * Starts (or resumes) a guest by WhatsApp number. Returning guests keep
 * their code and gallery link; new guests get a fresh code.
 */
export async function startGuest(eventId: string, _prev: StartGuestState, formData: FormData): Promise<StartGuestState> {
  const values = {
    phone: String(formData.get("phone") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
  };
  const fieldErrors: Record<string, string> = {};

  const phone = normalizePhone(values.phone);
  if (!phone) fieldErrors.phone = "Enter a WhatsApp number, like 98123 45678";
  if (values.name.length > 120) fieldErrors.name = "Keep the name under 120 characters";
  if (formData.get("consent") !== "on") fieldErrors.consent = "The guest needs to agree first";
  if (Object.keys(fieldErrors).length || !phone) return { error: null, fieldErrors, values };

  let event;
  try {
    ({ event } = await liveEvent(eventId));
  } catch (e) {
    return { error: (e as Error).message, values };
  }

  const supabase = await createClient();
  const existing = await supabase
    .from("guests")
    .select(GUEST_COLUMNS)
    .eq("event_id", event.id)
    .eq("phone_e164", phone)
    .maybeSingle();
  if (existing.error) return { error: "Couldn't look up the guest. Try again.", values };

  if (existing.data) {
    let row = existing.data;
    if (values.name && values.name !== row.name) {
      const updated = await supabase.from("guests").update({ name: values.name }).eq("id", row.id).select(GUEST_COLUMNS).single();
      if (!updated.error) row = updated.data;
    }
    return { error: null, guest: toCaptureGuest(row as Parameters<typeof toCaptureGuest>[0]), returning: true };
  }

  // New guest: pick an unused code, retrying if two operators race for it.
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await supabase.from("guests").select("code").eq("event_id", event.id);
    if (taken.error) return { error: "Couldn't create the guest. Try again.", values };

    let code: string;
    try {
      code = pickGuestCode(new Set(taken.data.map((g) => g.code)));
    } catch {
      return { error: "This event has run out of guest codes.", values };
    }

    const inserted = await supabase
      .from("guests")
      .insert({
        event_id: event.id,
        code,
        phone_e164: phone,
        name: values.name || null,
        consent_at: new Date().toISOString(),
      })
      .select(GUEST_COLUMNS)
      .single();

    if (!inserted.error) {
      return { error: null, guest: toCaptureGuest(inserted.data as Parameters<typeof toCaptureGuest>[0]), returning: false };
    }
    if (inserted.error.code !== "23505") return { error: "Couldn't create the guest. Try again.", values };
    // Unique clash: either the code was just taken, or the same number was added
    // by another operator. Loop; the lookup above handles the second case next time.
    const again = await supabase.from("guests").select(GUEST_COLUMNS).eq("event_id", event.id).eq("phone_e164", phone).maybeSingle();
    if (again.data) return { error: null, guest: toCaptureGuest(again.data as Parameters<typeof toCaptureGuest>[0]), returning: true };
  }

  return { error: "Couldn't create the guest. Try again.", values };
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
  if (error && error.code !== "23505") return { ok: false, error: "Couldn't save the photo. Try again." };
  return { ok: true };
}

export async function markLinkSent(eventId: string, guestId: string): Promise<void> {
  const { event } = await liveEvent(eventId);
  if (!UUID_PATTERN.test(guestId)) return;
  const supabase = await createClient();
  await supabase.from("guests").update({ link_sent_at: new Date().toISOString() }).eq("id", guestId).eq("event_id", event.id);
}
