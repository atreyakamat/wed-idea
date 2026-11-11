import { authenticateWorker, json, workerBlocked } from "@/lib/projects/worker-api";

/** Who this token belongs to. `cwp-worker login` calls it to check the token. */
export async function GET(request: Request) {
  const session = await authenticateWorker(request);
  if (session instanceof Response) return session;
  return json({ studio: { id: session.studio.id, name: session.studio.name }, computer: session.computer, blocked: workerBlocked(session.studio) });
}
