import { studioStyle } from "@/lib/projects/review";
import { authenticateWorker, json, workerBlocked } from "@/lib/projects/worker-api";

/**
 * Who this token belongs to, and the studio's favourite look per kind of
 * light (learnt on the website). `cwp-worker login` calls it to check the
 * token; the PC app reads the style before editing a folder.
 */
export async function GET(request: Request) {
  const session = await authenticateWorker(request);
  if (session instanceof Response) return session;
  const style = await studioStyle(session.supabase, session.studio.id);
  return json({ studio: { id: session.studio.id, name: session.studio.name }, computer: session.computer, blocked: workerBlocked(session.studio), style });
}
