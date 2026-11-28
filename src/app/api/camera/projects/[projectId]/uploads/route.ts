import { postGuard, projectSession } from "@/lib/camera/access";
import { reservePhotoUpload } from "@/lib/projects/project-writes";
import { json, jsonError, readJson } from "@/lib/projects/worker-api";

/** Reserves one photo in a project the caller can send to. The same rules as the PC app's upload route. */
export async function POST(request: Request, ctx: RouteContext<"/api/camera/projects/[projectId]/uploads">) {
  const refused = postGuard(request);
  if (refused) return refused;
  const access = await projectSession((await ctx.params).projectId);
  if (access instanceof Response) return access;

  const edited = (await readJson(request))?.edited === true;
  const r = await reservePhotoUpload(access.session.writer, access.project, edited);
  return r.ok ? json(r.value, 201) : jsonError(r.status, r.error);
}
