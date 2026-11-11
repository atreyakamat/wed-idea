"use server";

import { getProjectGalleryPage } from "@/lib/projects/gallery";

/** Next page of a public gallery. The token is the only key, as on the page itself. */
export async function loadGalleryPhotos(token: string, offset: number) {
  return getProjectGalleryPage(String(token), Number(offset));
}
