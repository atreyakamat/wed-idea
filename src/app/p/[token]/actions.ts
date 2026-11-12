"use server";

import { getGalleryDownloadList, getProjectGalleryPage, getVisitorFavourites, setHeart } from "@/lib/projects/gallery";
import { allow, clientIp } from "@/lib/rate-limit";

// Public gallery actions. The gallery link (token) is the only key, as on the
// page itself; the visitor id is a random id the guest's browser keeps.
// Generous limits per IP stop scripts without ever bothering a real guest.

export async function loadGalleryPhotos(token: string, offset: number) {
  if (!(await allow(`gallery:${await clientIp()}`, 600, 60))) return { photos: [], hasMore: true };
  return getProjectGalleryPage(String(token), Number(offset));
}

export async function heartPhoto(token: string, visitor: string, photoId: string, on: boolean): Promise<boolean> {
  const ip = await clientIp();
  if (!(await allow(`heart:ip:${ip}`, 300, 60)) || !(await allow(`heart:v:${String(visitor)}`, 120, 60))) return false;
  return setHeart(String(token), String(visitor), String(photoId), on === true);
}

export async function loadFavourites(token: string, visitor: string) {
  if (!(await allow(`gallery:${await clientIp()}`, 600, 60))) return [];
  return getVisitorFavourites(String(token), String(visitor));
}

export async function loadDownloadList(token: string) {
  if (!(await allow(`download:${await clientIp()}`, 30, 600))) return null;
  return getGalleryDownloadList(String(token));
}
