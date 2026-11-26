import { studioStyle } from "@/lib/projects/review";
import { authenticateWorker, json, workerBlocked, workerPreflight } from "@/lib/projects/worker-api";

/**
 * Who this token belongs to, and the studio's favourite look per kind of
 * light (learnt on the website). `cwp-worker login` calls it to check the
 * token; the PC app reads the style before editing a folder. A web-app caller
 * passes ?organizationId=<studio> instead.
 */
export async function GET(request: Request) {
  const session = await authenticateWorker(request, { organizationId: new URL(request.url).searchParams.get("organizationId") });
  if (session instanceof Response) return session;
  const style = await studioStyle(session.supabase, session.studio.id);
  return json({ studio: { id: session.studio.id, name: session.studio.name }, computer: session.computer, blocked: workerBlocked(session.studio), style });
}

export const OPTIONS = workerPreflight;
