import { PROJECT_KINDS } from "@/lib/projects/form";
import { authenticateWorker, json, jsonError, readJson } from "@/lib/projects/worker-api";
import { findOrCreateProject } from "@/lib/projects/project-writes";

type Row = { id: string; name: string; slug: string; status: string; project_photos: { count: number }[] };

/** The studio's projects, newest first. */
export async function GET(request: Request) {
  const session = await authenticateWorker(request);
  if (session instanceof Response) return session;
  const { data, error } = await session.supabase
    .from("projects")
    .select("id, name, slug, status, project_photos (count)")
    .eq("organization_id", session.studio.id)
    .order("created_at", { ascending: false })
    .overrideTypes<Row[], { merge: false }>();
  if (error) return jsonError(500, "Couldn't list projects. Try again.");
  return json({
    projects: (data ?? []).map(({ project_photos, ...p }) => ({ ...p, photoCount: project_photos[0]?.count ?? 0 })),
  });
}

/**
 * Finds the project for a folder, creating it if needed. The folder's name is
 * matched by its short name ("Meera 30th" -> "meera-30th"), so watching the
 * same folder again reuses its project instead of making a new one.
 */
export async function POST(request: Request) {
  const session = await authenticateWorker(request);
  if (session instanceof Response) return session;
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) return jsonError(400, "Give the project a name of 1 to 120 characters.");
  const kind = typeof body?.kind === "string" && (PROJECT_KINDS as readonly string[]).includes(body.kind) ? body.kind : "other";

  const r = await findOrCreateProject(session, name, kind);
  if (!r.ok) return jsonError(r.status, r.error);
  return r.value.created ? json({ project: r.value.project, created: true }, 201) : json({ project: r.value.project, created: false });
}
