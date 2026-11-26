import { projectFileNames } from "@/lib/projects/queries";
import { authenticateWorker, json, workerPreflight, workerProject } from "@/lib/projects/worker-api";

/** Every file name already in the project, so the app uploads only new files. */
export async function GET(request: Request, ctx: RouteContext<"/api/worker/projects/[projectId]/files">) {
  const { projectId } = await ctx.params;
  const session = await authenticateWorker(request, { projectId });
  if (session instanceof Response) return session;
  const project = await workerProject(session, projectId);
  if (project instanceof Response) return project;
  return json({ names: await projectFileNames(project.id, session.supabase) });
}

export const OPTIONS = workerPreflight;
