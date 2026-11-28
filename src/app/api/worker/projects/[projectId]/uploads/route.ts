import { reservePhotoUpload } from "@/lib/projects/project-writes";
import { authenticateWorker, json, jsonError, readJson, workerProject } from "@/lib/projects/worker-api";

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

  const edited = (await readJson(request))?.edited === true;
  const r = await reservePhotoUpload(session, project, edited);
  return r.ok ? json(r.value, 201) : jsonError(r.status, r.error);
}
