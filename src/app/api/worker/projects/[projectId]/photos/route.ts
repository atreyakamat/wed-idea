import type { LightingGroup } from "@/lib/projects/paths";
import { recordProjectPhoto } from "@/lib/projects/queries";
import { authenticateWorker, json, jsonError, readJson, workerProject } from "@/lib/projects/worker-api";
import { friendlyDbError } from "@/lib/studio/status";

/** A number, null when missing, NaN (rejected later) when not a number. */
function nullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "number" ? v : Number.NaN;
}

/** A string, null when missing or empty, "invalid" (rejected later) when not a string. */
function nullableString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" ? v : "invalid";
}

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
      photoId: typeof body.photoId === "string" ? body.photoId : "",
      fileName: typeof body.fileName === "string" ? body.fileName : "",
      width: Number(body.width),
      height: Number(body.height),
      bytes: nullableNumber(body.bytes),
      takenAt: nullableString(body.takenAt),
      tone: nullableString(body.tone),
      edit: body.edited === true ? { lighting: (typeof body.lighting === "string" ? body.lighting : "") as LightingGroup, look: typeof body.look === "string" ? body.look : "" } : null,
    },
    "worker",
    friendlyDbError,
  );
  if (!result.ok) return jsonError(result.status ?? 500, result.error);
  return json({ ok: true, duplicate: Boolean(result.duplicate) }, result.duplicate ? 200 : 201);
}

export { OPTIONS } from "@/lib/projects/preflight";
