import "server-only";
import type { StudioStatus } from "@/lib/auth";
import { isGalleryOpen } from "@/lib/capture/photos";
import { showBranding } from "@/lib/gallery/queries";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { validDesigns, type SheetDesign } from "./look-sheet";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROJECT_BUCKET } from "./paths";
import { PUBLIC_SIGNED_URL_SECONDS, projectPhotoPage, type ProjectPhoto } from "./queries";
import { PROJECT_TOKEN_PATTERN } from "./share";

export type PublicPhoto = Pick<ProjectPhoto, "id" | "width" | "height" | "thumbUrl" | "fullUrl" | "tone"> & { downloadName: string };

/** Most hearts one visitor can give in one gallery (keeps the table sane). */
export const MAX_HEARTS_PER_VISITOR = 2000;

export type ProjectGallery =
  | { state: "not-found" }
  | { state: "expired"; projectName: string; studioName: string; expiredAt: string }
  | {
      state: "open";
      projectName: string;
      studioName: string;
      shootDate: string | null;
      expiresAt: string;
      photoCount: number;
      photos: PublicPhoto[];
      hasMore: boolean;
      showBranding: boolean;
      lookSheets: SheetDesign[];
      logoUrl: string | null;
      cover: PublicPhoto | null;
    };

type Row = {
  id: string;
  name: string;
  shoot_date: string | null;
  status: string;
  gallery_expires_at: string | null;
  organizations: {
    name: string;
    logo_path: string | null;
    status: StudioStatus;
    trial_ends_at: string;
    paid_until: string | null;
    plans: { remove_branding: boolean } | null;
    look_sheets: string[];
  } | null;
};

/** "Ceremony/IMG_0001.JPG" -> "IMG_0001.jpg": what a guest's download is called. */
export function downloadName(fileName: string): string {
  const base = (fileName.split("/").pop() ?? "photo").replace(/\.[^.]+$/, "");
  return `${base.replace(/[^\w.-]+/g, "-") || "photo"}.jpg`;
}

function toPublic(photos: ProjectPhoto[]): PublicPhoto[] {
  return photos.map((p) => ({ id: p.id, width: p.width, height: p.height, thumbUrl: p.thumbUrl, fullUrl: p.fullUrl, tone: p.tone, downloadName: downloadName(p.fileName) }));
}

/** Public address of a studio's logo in the "studio-assets" bucket. */
export function studioLogoUrl(logoPath: string | null): string | null {
  if (!logoPath) return null;
  let base = publicEnv().NEXT_PUBLIC_SUPABASE_URL;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/storage/v1/object/public/studio-assets/${logoPath}`;
}

/** The published, still-open project behind a gallery token, or null. */
async function openProject(token: string) {
  const found = await findProject(token);
  return found && isGalleryOpen(found.project.gallery_expires_at) ? found : null;
}

/** The published project behind a gallery token, or null. */
async function findProject(token: string) {
  if (!PROJECT_TOKEN_PATTERN.test(token)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, shoot_date, status, gallery_expires_at, organizations (name, logo_path, look_sheets, status, trial_ends_at, paid_until, plans (remove_branding))")
    .eq("access_token", token)
    .maybeSingle<Row>();
  if (error) throw new Error(`Couldn't load the gallery: ${error.message}`);
  if (!data || data.status !== "published" || !data.gallery_expires_at || !data.organizations) return null;
  return { supabase, project: data as Row & { gallery_expires_at: string; organizations: NonNullable<Row["organizations"]> } };
}

/**
 * A project's public gallery. Guests aren't signed in, so this runs with the
 * service role: the token is the only key, it's checked strictly, and only
 * the project's visible photos are returned.
 */
export async function getProjectGallery(token: string, now: Date = new Date()): Promise<ProjectGallery> {
  const found = await findProject(token);
  if (!found) return { state: "not-found" };
  const { supabase, project } = found;
  const studioName = project.organizations.name;

  if (!isGalleryOpen(project.gallery_expires_at, now)) {
    return { state: "expired", projectName: project.name, studioName, expiredAt: project.gallery_expires_at };
  }

  const [page, count, loved] = await Promise.all([
    projectPhotoPage(supabase, project.id, 0, { visibleOnly: true, expiresIn: PUBLIC_SIGNED_URL_SECONDS }),
    supabase.from("project_photos").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("hidden", false),
    mostLovedPhoto(supabase, project.id),
  ]);
  const photos = toPublic(page.photos);
  // The cover is the guests' favourite once there is one, otherwise the first photo.
  const cover = (loved && (photos.find((p) => p.id === loved) ?? (await photosById(supabase, project.id, [loved]))[0])) || photos[0] || null;

  return {
    state: "open",
    projectName: project.name,
    studioName,
    shootDate: project.shoot_date,
    expiresAt: project.gallery_expires_at,
    photoCount: count.count ?? page.photos.length,
    photos,
    hasMore: page.hasMore,
    showBranding: showBranding(project.organizations),
    lookSheets: validDesigns(project.organizations.look_sheets),
    logoUrl: studioLogoUrl(project.organizations.logo_path),
    cover,
  };
}

type Admin = ReturnType<typeof createAdminClient>;

async function mostLovedPhoto(supabase: Admin, projectId: string): Promise<string | null> {
  const { data } = await supabase.from("project_photo_hearts").select("photo_id, project_photos!inner (project_id, hidden)").eq("project_photos.project_id", projectId).eq("project_photos.hidden", false).limit(5000);
  if (!data?.length) return null;
  const counts = new Map<string, number>();
  for (const row of data as { photo_id: string }[]) counts.set(row.photo_id, (counts.get(row.photo_id) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

type Row2 = { id: string; file_name: string; path: string; thumb_path: string; edited_path: string | null; edited_thumb_path: string | null; width: number; height: number; tone: string | null };

/** Visible photos of a project by id, signed for the gallery. */
async function photosById(supabase: Admin, projectId: string, ids: string[]): Promise<PublicPhoto[]> {
  const wanted = ids.filter((id) => UUID_PATTERN.test(id)).slice(0, 2000);
  if (!wanted.length) return [];
  const rows: Row2[] = [];
  for (let i = 0; i < wanted.length; i += 200) {
    const { data } = await supabase
      .from("project_photos")
      .select("id, file_name, path, thumb_path, edited_path, edited_thumb_path, width, height, tone")
      .eq("project_id", projectId)
      .eq("hidden", false)
      .in("id", wanted.slice(i, i + 200))
      .overrideTypes<Row2[], { merge: false }>();
    rows.push(...(data ?? []));
  }
  return signRows(supabase, rows);
}

async function signRows(supabase: Admin, rows: Row2[]): Promise<PublicPhoto[]> {
  const paths = rows.flatMap((r) => [r.edited_thumb_path ?? r.thumb_path, r.edited_path ?? r.path]);
  const urlFor = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 1000) {
    const { data } = await supabase.storage.from(PROJECT_BUCKET).createSignedUrls(paths.slice(i, i + 1000), PUBLIC_SIGNED_URL_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) urlFor.set(s.path, s.signedUrl);
  }
  return rows.flatMap((r) => {
    const thumbUrl = urlFor.get(r.edited_thumb_path ?? r.thumb_path);
    const fullUrl = urlFor.get(r.edited_path ?? r.path);
    return thumbUrl && fullUrl ? [{ id: r.id, width: r.width, height: r.height, thumbUrl, fullUrl, tone: r.tone, downloadName: downloadName(r.file_name) }] : [];
  });
}

/** Every visible photo in shooting order, for "Download all". */
export async function getGalleryDownloadList(token: string): Promise<PublicPhoto[] | null> {
  const found = await openProject(token);
  if (!found) return null;
  const rows: Row2[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await found.supabase
      .from("project_photos")
      .select("id, file_name, path, thumb_path, edited_path, edited_thumb_path, width, height, tone")
      .eq("project_id", found.project.id)
      .eq("hidden", false)
      .order("taken_at", { ascending: true, nullsFirst: false })
      .order("file_name", { ascending: true })
      .range(from, from + 999)
      .overrideTypes<Row2[], { merge: false }>();
    if (error) return null;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return signRows(found.supabase, rows);
}

/** The photos a visitor has hearted in this gallery (any page). */
export async function getVisitorFavourites(token: string, visitor: string): Promise<PublicPhoto[]> {
  if (!UUID_PATTERN.test(visitor)) return [];
  const found = await openProject(token);
  if (!found) return [];
  const { data } = await found.supabase
    .from("project_photo_hearts")
    .select("photo_id, project_photos!inner (project_id)")
    .eq("visitor", visitor)
    .eq("project_photos.project_id", found.project.id)
    .limit(MAX_HEARTS_PER_VISITOR);
  return photosById(found.supabase, found.project.id, ((data ?? []) as { photo_id: string }[]).map((r) => r.photo_id));
}

/** Adds or removes a visitor's heart on one photo. False if the photo or gallery isn't open. */
export async function setHeart(token: string, visitor: string, photoId: string, on: boolean): Promise<boolean> {
  if (!UUID_PATTERN.test(visitor) || !UUID_PATTERN.test(photoId)) return false;
  const found = await openProject(token);
  if (!found) return false;
  const { supabase, project } = found;
  const { data: photo } = await supabase.from("project_photos").select("id").eq("id", photoId).eq("project_id", project.id).eq("hidden", false).maybeSingle();
  if (!photo) return false;
  if (!on) {
    const { error } = await supabase.from("project_photo_hearts").delete().eq("photo_id", photoId).eq("visitor", visitor);
    return !error;
  }
  const { count } = await supabase
    .from("project_photo_hearts")
    .select("photo_id, project_photos!inner (project_id)", { count: "exact", head: true })
    .eq("visitor", visitor)
    .eq("project_photos.project_id", project.id);
  if ((count ?? 0) >= MAX_HEARTS_PER_VISITOR) return false;
  const { error } = await supabase.from("project_photo_hearts").upsert({ photo_id: photoId, visitor }, { onConflict: "photo_id,visitor", ignoreDuplicates: true });
  return !error;
}

/** The next page of a gallery's photos, for "Load more". Empty once it's closed. */
export async function getProjectGalleryPage(token: string, offset: number): Promise<{ photos: PublicPhoto[]; hasMore: boolean }> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) return { photos: [], hasMore: false };
  const found = await openProject(token);
  if (!found) return { photos: [], hasMore: false };
  const page = await projectPhotoPage(found.supabase, found.project.id, offset, { visibleOnly: true, expiresIn: PUBLIC_SIGNED_URL_SECONDS });
  return { photos: toPublic(page.photos), hasMore: page.hasMore };
}


/**
 * The cover photo's thumbnail bytes for a gallery's share image. Read
 * straight from storage (no signed link leaves the server).
 */
export async function galleryCoverThumbnail(token: string, photoId: string): Promise<Uint8Array | null> {
  if (!UUID_PATTERN.test(photoId)) return null;
  const found = await openProject(token);
  if (!found) return null;
  const { data: row } = await found.supabase
    .from("project_photos")
    .select("thumb_path, edited_thumb_path")
    .eq("id", photoId)
    .eq("project_id", found.project.id)
    .eq("hidden", false)
    .maybeSingle<{ thumb_path: string; edited_thumb_path: string | null }>();
  if (!row) return null;
  const { data } = await found.supabase.storage.from(PROJECT_BUCKET).download(row.edited_thumb_path ?? row.thumb_path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
