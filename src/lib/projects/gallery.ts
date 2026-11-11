import "server-only";
import type { StudioStatus } from "@/lib/auth";
import { isGalleryOpen } from "@/lib/capture/photos";
import { showBranding } from "@/lib/gallery/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { projectPhotoPage, type ProjectPhoto } from "./queries";
import { PROJECT_TOKEN_PATTERN } from "./share";

export type PublicPhoto = Pick<ProjectPhoto, "id" | "width" | "height" | "thumbUrl" | "fullUrl"> & { downloadName: string };

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
    };

type Row = {
  id: string;
  name: string;
  shoot_date: string | null;
  status: string;
  gallery_expires_at: string | null;
  organizations: {
    name: string;
    status: StudioStatus;
    trial_ends_at: string;
    paid_until: string | null;
    plans: { remove_branding: boolean } | null;
  } | null;
};

/** "Ceremony/IMG_0001.JPG" -> "IMG_0001.jpg": what a guest's download is called. */
export function downloadName(fileName: string): string {
  const base = (fileName.split("/").pop() ?? "photo").replace(/\.[^.]+$/, "");
  return `${base.replace(/[^\w.-]+/g, "-") || "photo"}.jpg`;
}

function toPublic(photos: ProjectPhoto[]): PublicPhoto[] {
  return photos.map((p) => ({ id: p.id, width: p.width, height: p.height, thumbUrl: p.thumbUrl, fullUrl: p.fullUrl, downloadName: downloadName(p.fileName) }));
}

/** The published project behind a gallery token, or null. */
async function findProject(token: string) {
  if (!PROJECT_TOKEN_PATTERN.test(token)) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, shoot_date, status, gallery_expires_at, organizations (name, status, trial_ends_at, paid_until, plans (remove_branding))")
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

  const [page, count] = await Promise.all([
    projectPhotoPage(supabase, project.id, 0, { visibleOnly: true }),
    supabase.from("project_photos").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("hidden", false),
  ]);

  return {
    state: "open",
    projectName: project.name,
    studioName,
    shootDate: project.shoot_date,
    expiresAt: project.gallery_expires_at,
    photoCount: count.count ?? page.photos.length,
    photos: toPublic(page.photos),
    hasMore: page.hasMore,
    showBranding: showBranding(project.organizations),
  };
}

/** The next page of a gallery's photos, for "Load more". Empty once it's closed. */
export async function getProjectGalleryPage(token: string, offset: number): Promise<{ photos: PublicPhoto[]; hasMore: boolean }> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) return { photos: [], hasMore: false };
  const found = await findProject(token);
  if (!found || !isGalleryOpen(found.project.gallery_expires_at)) return { photos: [], hasMore: false };
  const page = await projectPhotoPage(found.supabase, found.project.id, offset, { visibleOnly: true });
  return { photos: toPublic(page.photos), hasMore: page.hasMore };
}
