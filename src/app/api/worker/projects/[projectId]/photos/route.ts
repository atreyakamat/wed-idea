import { recordProjectPhoto } from "@/lib/projects/queries";
import { authenticateWorker, json, jsonError, readJson, workerProject } from "@/lib/projects/worker-api";
import { friendlyDbError } from "@/lib/studio/status";

const nullableNumber = (v: unknown) => (v === null || v === undefined ? null : typeof v === "number" ? v : Number.NaN);
const nullableString = (v: unknown) => (v === null || v === undefined || v === "" ? null : typeof v === "string" ? v : "invalid");

/** Records a photo once both of its files are uploaded. */
export async function POST(request: Request, ctx: RouteContext<"/api/worker/projects/[projectId]/photos">) {
  const session = await authenticateWorker(request);
  if (session instanceof Response) return session;
  const project = await workerProject(session, (await ctx.params).projectId);
  if (project instanceof Response) return project;

  const body = await readJson(request);
  if (!body) return jsonError(400, "Send the photo as JSON.");
  const result = await recordProjectPhoto(
    session.supabase,
    session.supabase,
    project,
    {
      photoId: String(body.photoId ?? ""),
      fileName: typeof body.fileName === "string" ? body.fileName : "",
      width: Number(body.width),
      height: Number(body.height),
      bytes: nullableNumber(body.bytes),
      takenAt: nullableString(body.takenAt),
    },
    "worker",
    friendlyDbError,
  );
  if (!result.ok) return jsonError(result.status ?? 500, result.error);
  return json({ ok: true, duplicate: Boolean(result.duplicate) }, result.duplicate ? 200 : 201);
}
