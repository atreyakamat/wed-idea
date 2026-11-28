import { postGuard, studioSession } from "@/lib/camera/access";
import { parseProjectName } from "@/lib/camera/rules";
import { findOrCreateProject } from "@/lib/projects/project-writes";
import { json, jsonError, readJson } from "@/lib/projects/worker-api";

/** Creates the project named, or finds it when a project with that name is already there. */
export async function POST(request: Request) {
  const refused = postGuard(request);
  if (refused) return refused;
  const session = await studioSession();
  if (session instanceof Response) return session;
  const name = parseProjectName((await readJson(request))?.name);
  if (!name) return jsonError(400, "Give the project a name of 1 to 120 characters.");

  const r = await findOrCreateProject(session.writer, name, "other");
  if (!r.ok) return jsonError(r.status, r.error);
  return r.value.created ? json({ project: r.value.project, created: true }, 201) : json({ project: r.value.project, created: false });
}
