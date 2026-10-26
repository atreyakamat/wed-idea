// Photo sizes and storage paths, shared by the capture screen (browser) and
// the server action that records each photo.

/** Long edge of the stored photo: enough for a 5.4 × 8.6 cm print at 300+ dpi. */
export const FULL_LONG_EDGE = 2400;
/** Long edge of the gallery thumbnail. */
export const THUMB_LONG_EDGE = 900;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Scales width × height down so the long edge fits, never scaling up. */
export function fitWithin(width: number, height: number, longEdge: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new Error("Image has no size");
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Where a photo's two files live: "<studio>/<event>/<guest>/<photo>.jpg". */
export function photoPaths(organizationId: string, eventId: string, guestId: string, photoId: string) {
  for (const id of [organizationId, eventId, guestId, photoId]) {
    if (!UUID_PATTERN.test(id)) throw new Error("Invalid id in photo path");
  }
  const base = `${organizationId}/${eventId}/${guestId}/${photoId}`;
  return { full: `${base}.jpg`, thumb: `${base}.thumb.jpg` };
}

export function isGalleryOpen(galleryExpiresAt: string, now: Date = new Date()): boolean {
  return now.getTime() < new Date(galleryExpiresAt).getTime();
}
