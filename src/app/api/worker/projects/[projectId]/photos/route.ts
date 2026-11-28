import { recordPhoto } from "@/lib/projects/project-writes";
import { authenticateWorker, json, jsonError, readJson, workerProject } from "@/lib/projects/worker-api";

/** Records a photo once both of its files are uploaded. */
export async function POST(request: Request, ctx: RouteContext<"/api/worker/projects/[projectId]/photos">) {
  const session = await authenticateWorker(request);
  if (session instanceof Response) return session;
  const project = await workerProject(session, (await ctx.params).projectId);
  if (project instanceof Response) return project;

  const body = await readJson(request);
  if (!body) return jsonError(400, "Send the photo as JSON.");
  const r = await recordPhoto(session, project, body, "worker");
  if (!r.ok) return jsonError(r.status, r.error);
  return json({ ok: true, duplicate: r.value.duplicate }, r.value.duplicate ? 200 : 201);
}
