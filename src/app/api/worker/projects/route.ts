import { PROJECT_KINDS } from "@/lib/projects/form";
import { uniqueProjectSlug } from "@/lib/projects/slug";
import { authenticateWorker, json, jsonError, readJson, workerBlocked } from "@/lib/projects/worker-api";
import { friendlyDbError } from "@/lib/studio/status";

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

  const { supabase, studio } = session;
  const wanted = uniqueProjectSlug(name, new Set());
  const existing = await supabase
    .from("projects")
    .select("id, name, slug, status")
    .eq("organization_id", studio.id)
    .eq("slug", wanted)
    .maybeSingle();
  if (existing.error) return jsonError(500, "Couldn't look up the project. Try again.");
  if (existing.data) return json({ project: existing.data, created: false });

  const blocked = workerBlocked(studio);
  if (blocked) return jsonError(403, blocked);

  const { data, error } = await supabase
    .from("projects")
    .insert({ organization_id: studio.id, name, slug: wanted, kind })
    .select("id, name, slug, status")
    .single();
  if (error) {
    if (error.code === "23505") {
      const again = await supabase.from("projects").select("id, name, slug, status").eq("organization_id", studio.id).eq("slug", wanted).maybeSingle();
      if (again.data) return json({ project: again.data, created: false });
    }
    const friendly = friendlyDbError(error);
    return jsonError(friendly ? 403 : 500, friendly ?? "Couldn't create the project. Try again.");
  }
  return json({ project: data, created: true }, 201);
}

export { OPTIONS } from "@/lib/projects/preflight";
