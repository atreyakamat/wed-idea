import { listPlansWith } from "@/lib/projects/worker-plans";
import { PROJECT_BUCKET, projectPhotoPaths } from "@/lib/projects/paths";
import { countProjectPhotos } from "@/lib/projects/queries";
import { authenticateWorker, json, jsonError, readJson, workerBlocked, workerProject } from "@/lib/projects/worker-api";

/**
 * Reserves a photo: returns a new photo id and two one-time upload URLs (the
 * web-size image and its thumbnail), or four with { "edited": true } (plus the
 * auto-edited pair). The app PUTs the JPEGs to them, then
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

  // Caps files in the folder, so upload links that are never confirmed can't
  // fill storage past the plan's photo limit.
  const room = await session.supabase.rpc("project_has_file_room", { p_project: project.id });
  if (room.error) return jsonError(500, "Couldn't prepare the upload. Try again.");
  if (room.data !== true) return jsonError(403, "This project has too many unfinished uploads. Try again later.");

  const photoId = crypto.randomUUID();
  const paths = projectPhotoPaths(project.organization_id, project.id, photoId);
  const edited = (await readJson(request))?.edited === true;
  const bucket = session.supabase.storage.from(PROJECT_BUCKET);
  const wanted = edited ? [paths.full, paths.thumb, paths.editedFull, paths.editedThumb] : [paths.full, paths.thumb];
  const links = await Promise.all(wanted.map((path) => bucket.createSignedUploadUrl(path)));
  if (links.some((l) => l.error || !l.data)) return jsonError(500, "Couldn't prepare the upload. Try again.");
  const [full, thumb, editedFull, editedThumb] = links.map((l) => l.data?.signedUrl);
  return json({ photoId, full, thumb, ...(edited ? { editedFull, editedThumb } : {}) }, 201);
}

export { OPTIONS } from "@/lib/projects/preflight";
