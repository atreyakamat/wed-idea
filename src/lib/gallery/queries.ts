import "server-only";
import { GUEST_TOKEN_PATTERN } from "@/lib/capture/share";
import { isGalleryOpen } from "@/lib/capture/photos";
import type { EventStatus } from "@/lib/events/status";
import { createAdminClient } from "@/lib/supabase/admin";

/** How long signed photo links in the gallery stay valid. */
const SIGNED_URL_SECONDS = 60 * 60;

export type GalleryPhoto = {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  width: number | null;
  height: number | null;
};

export type GuestGallery =
  | { state: "not-found" }
  | {
      state: "expired";
      coupleNames: string;
      expiredAt: string;
    }
  | {
      state: "open";
      guestName: string | null;
      coupleNames: string;
      venue: string | null;
      startsAt: string;
      expiresAt: string;
      theme: unknown;
      photos: GalleryPhoto[];
      /** False on plans that remove the Cute Wedding Polaroid credit. */
      showBranding: boolean;
    };

type GuestWithEvent = {
  id: string;
  name: string | null;
  events: {
    couple_names: string;
    venue: string | null;
    starts_at: string;
    gallery_expires_at: string;
    status: EventStatus;
    theme: unknown;
    organizations: { plans: { remove_branding: boolean } | null } | null;
  } | null;
};

/**
 * Looks a guest up by the secret token in their link. Guests aren't signed
 * in, so this runs with the service role: the token is the only key, it is
 * checked strictly, and only this guest's own photos are returned.
 */
export async function getGuestGallery(token: string, now: Date = new Date()): Promise<GuestGallery> {
  if (!GUEST_TOKEN_PATTERN.test(token)) return { state: "not-found" };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("guests")
    .select("id, name, events (couple_names, venue, starts_at, gallery_expires_at, status, theme, organizations (plans (remove_branding)))")
    .eq("access_token", token)
    .maybeSingle<GuestWithEvent>();
  if (error) throw new Error(`Couldn't load the gallery: ${error.message}`);

  const event = data?.events;
  if (!data || !event || event.status === "archived") return { state: "not-found" };

  if (!isGalleryOpen(event.gallery_expires_at, now)) {
    return { state: "expired", coupleNames: event.couple_names, expiredAt: event.gallery_expires_at };
  }

  const photos = await supabase
    .from("photos")
    .select("id, storage_path, thumb_path, width, height")
    .eq("guest_id", data.id)
    .is("deleted_at", null)
    .order("captured_at", { ascending: true });
  if (photos.error) throw new Error(`Couldn't load photos: ${photos.error.message}`);

  const rows = photos.data ?? [];
  const paths = rows.flatMap((p) => [p.thumb_path ?? p.storage_path, p.storage_path]);
  const signed = paths.length
    ? await supabase.storage.from("event-photos").createSignedUrls(paths, SIGNED_URL_SECONDS)
    : { data: [], error: null };
  if (signed.error) throw new Error(`Couldn't load photos: ${signed.error.message}`);

  const urlFor = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  const galleryPhotos = rows.flatMap((p) => {
    const thumbUrl = urlFor.get(p.thumb_path ?? p.storage_path);
    const fullUrl = urlFor.get(p.storage_path);
    return thumbUrl && fullUrl ? [{ id: p.id, thumbUrl, fullUrl, width: p.width, height: p.height }] : [];
  });

  return {
    state: "open",
    guestName: data.name,
    coupleNames: event.couple_names,
    venue: event.venue,
    startsAt: event.starts_at,
    expiresAt: event.gallery_expires_at,
    showBranding: !event.organizations?.plans?.remove_branding,
    theme: event.theme,
    photos: galleryPhotos,
  };
}
