"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/form";
import { requireStudioManager } from "@/lib/auth";
import { isDesignLocked, themeForEvent } from "@/lib/events/design";
import { parseEventDetails, parsePrintSettings } from "@/lib/events/form";
import { getEvent } from "@/lib/events/queries";
import { canUnlockDesign, checkTransition, type EventStatus } from "@/lib/events/status";
import { getTemplate } from "@/lib/polaroid/templates";
import { eventThemeSchema } from "@/lib/polaroid/theme";
import type { Palette, PaletteKey } from "@/lib/polaroid/types";
import { createClient } from "@/lib/supabase/server";

const SLUG_TAKEN = { slug: "That link is already used by another event. Try adding the date." };

function formValues(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
}

async function loadEvent(eventId: string) {
  const { studio } = await requireStudioManager();
  const event = await getEvent(studio.id, eventId);
  if (!event) throw new Error("Event not found.");
  return { studio, event };
}

export async function createEvent(_prev: FormState, formData: FormData): Promise<FormState> {
  const { studio } = await requireStudioManager();
  const parsed = parseEventDetails(formData);
  if (!parsed.ok) return { error: null, fieldErrors: parsed.fieldErrors, values: parsed.values };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...parsed.data, organization_id: studio.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: null, fieldErrors: SLUG_TAKEN, values: formValues(formData) };
    return { error: "Couldn't create the event. Try again.", values: formValues(formData) };
  }

  redirect(`/dashboard/events/${data.id}`);
}

export async function updateEventDetails(eventId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { studio } = await loadEvent(eventId);
  const parsed = parseEventDetails(formData);
  if (!parsed.ok) return { error: null, fieldErrors: parsed.fieldErrors, values: parsed.values };

  const supabase = await createClient();
  const { error } = await supabase.from("events").update(parsed.data).eq("id", eventId).eq("organization_id", studio.id);
  if (error) {
    if (error.code === "23505") return { error: null, fieldErrors: SLUG_TAKEN, values: formValues(formData) };
    return { error: "Couldn't save the details. Try again." };
  }

  refresh();
  return { error: null, success: "Details saved." };
}

export async function updatePrintSettings(eventId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { studio } = await loadEvent(eventId);
  const parsed = parsePrintSettings(formData);
  if (!parsed.ok) return { error: null, fieldErrors: parsed.fieldErrors, values: parsed.values };

  const supabase = await createClient();
  const { error } = await supabase.from("events").update(parsed.data).eq("id", eventId).eq("organization_id", studio.id);
  if (error) return { error: "Couldn't save print settings. Try again." };

  refresh();
  return { error: null, success: "Print settings saved." };
}

const PALETTE_KEYS: PaletteKey[] = ["paper", "primary", "accent", "ink"];

/** Saves the couple's design; with intent "lock" it also locks it. */
export async function saveDesign(eventId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { studio, event } = await loadEvent(eventId);
  if (isDesignLocked(event.theme)) return { error: "The design is locked. Unlock it to make changes." };

  const templateId = String(formData.get("templateId") ?? "");
  const template = getTemplate(templateId);
  // Store only colours the couple changed, so template updates still apply.
  const palette: Partial<Palette> = {};
  for (const key of PALETTE_KEYS) {
    const value = String(formData.get(`palette.${key}`) ?? "").toLowerCase();
    if (template && value && value !== template.defaultPalette[key].toLowerCase()) palette[key] = value;
  }

  const lock = formData.get("intent") === "lock";
  const place = String(formData.get("place") ?? "").trim();
  const parsed = eventThemeSchema.safeParse({
    templateId,
    palette,
    text: { names: formData.get("names"), date: formData.get("date"), place: place || undefined },
    filterId: formData.get("filterId"),
    lockedAt: lock ? new Date().toISOString() : null,
  });

  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path.at(-1)), i.message]));
    return { error: "Check the highlighted fields.", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ theme: parsed.data })
    .eq("id", eventId)
    .eq("organization_id", studio.id);
  if (error) return { error: "Couldn't save the design. Try again." };

  refresh();
  return { error: null, success: lock ? "Design locked. Every guest's polaroid will use it." : "Design saved." };
}

export async function unlockDesign(eventId: string): Promise<void> {
  const { studio, event } = await loadEvent(eventId);
  if (!canUnlockDesign(event.status)) throw new Error("The design can only be unlocked while the event is a draft.");

  const theme = themeForEvent(event);
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ theme: { ...theme, lockedAt: null } })
    .eq("id", eventId)
    .eq("organization_id", studio.id);
  if (error) throw new Error("Couldn't unlock the design.");
  refresh();
}

export async function changeStatus(eventId: string, to: EventStatus): Promise<FormState> {
  const { studio, event } = await loadEvent(eventId);
  const check = checkTransition(event.status, to, isDesignLocked(event.theme));
  if (!check.allowed) return { error: check.reason };

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ status: to })
    .eq("id", eventId)
    .eq("organization_id", studio.id)
    .eq("status", event.status);
  if (error) return { error: "Couldn't change the event status. Try again." };

  refresh();
  return { error: null };
}
