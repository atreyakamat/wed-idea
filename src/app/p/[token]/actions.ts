"use server";

import { getGalleryDownloadList, getProjectGalleryPage, getVisitorFavourites, setHeart } from "@/lib/projects/gallery";

// Public gallery actions. The gallery link (token) is the only key, as on the
// page itself; the visitor id is a random id the guest's browser keeps.

export async function loadGalleryPhotos(token: string, offset: number) {
  return getProjectGalleryPage(String(token), Number(offset));
}

export async function heartPhoto(token: string, visitor: string, photoId: string, on: boolean): Promise<boolean> {
  return setHeart(String(token), String(visitor), String(photoId), on === true);
}

export async function loadFavourites(token: string, visitor: string) {
  return getVisitorFavourites(String(token), String(visitor));
}

export async function loadDownloadList(token: string) {
  return getGalleryDownloadList(String(token));
}
