import { cameraState } from "@/lib/camera/access";
import { json, jsonError } from "@/lib/projects/worker-api";

/** Who is signed in, and the studio and projects they can send to. Open to guests too, who get { signedIn: false }. */
export async function GET() {
  try {
    return json(await cameraState());
  } catch {
    return jsonError(500, "Couldn't check your studio. Try again.");
  }
}
