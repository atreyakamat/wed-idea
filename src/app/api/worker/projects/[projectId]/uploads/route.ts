import { listPlansWith } from "@/lib/projects/worker-plans";
import { PROJECT_BUCKET, projectPhotoPaths } from "@/lib/projects/paths";
import { countProjectPhotos } from "@/lib/projects/queries";
import { authenticateWorker, json, jsonError, workerBlocked, workerProject } from "@/lib/projects/worker-api";

/**
 * Reserves a photo: returns a new photo id and two one-time upload URLs (the
 * web-size image and its thumbnail). The app PUTs the JPEGs to them, then
 * confirms with POST …/photos. Refuses early when the studio or project can't
 * take more photos; the database checks again when the photo is recorded.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/worker/projects/[projectId]/uploads">) {
  const session = await authenticateWorker(request);
  if (session instanceof Response) return session;
  const project = await workerProject(session, (await ctx.params).projectId);
  if (project instanceof Response) return project;

  const blocked = workerBlocked(session.studio);
  if (blocked) return jsonError(403, blocked);
  if (project.status === "archived") return jsonError(409, "This project is archived. Restore it to add photos.");

  const [plan, counts] = await Promise.all([listPlansWith(session.supabase, session.studio.planId), countProjectPhotos(project.id, session.supabase)]);
  if (plan && counts.total >= plan.photos_per_event) {
    return jsonError(403, `This project has reached ${plan.photos_per_event.toLocaleString("en-IN")} photos, the most the ${plan.name} plan allows.`);
  }

  const photoId = crypto.randomUUID();
  const paths = projectPhotoPaths(project.organization_id, project.id, photoId);
  const bucket = session.supabase.storage.from(PROJECT_BUCKET);
  const [full, thumb] = await Promise.all([bucket.createSignedUploadUrl(paths.full), bucket.createSignedUploadUrl(paths.thumb)]);
  if (full.error || thumb.error) return jsonError(500, "Couldn't prepare the upload. Try again.");
  return json({ photoId, full: full.data.signedUrl, thumb: thumb.data.signedUrl }, 201);
}
