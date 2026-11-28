import { postGuard, projectSession } from "@/lib/camera/access";
import { recordPhoto } from "@/lib/projects/project-writes";
import { json, jsonError, readJson } from "@/lib/projects/worker-api";

/** Records a photo the browser has finished uploading. Recorded as a browser upload. */
export async function POST(request: Request, ctx: RouteContext<"/api/camera/projects/[projectId]/photos">) {
  const refused = postGuard(request);
  if (refused) return refused;
  const access = await projectSession((await ctx.params).projectId);
  if (access instanceof Response) return access;

  const body = await readJson(request);
  if (!body) return jsonError(400, "Send the photo as JSON.");
  const r = await recordPhoto(access.session.writer, access.project, body, "browser");
  if (!r.ok) return jsonError(r.status, r.error);
  return json({ ok: true, duplicate: r.value.duplicate }, r.value.duplicate ? 200 : 201);
}
