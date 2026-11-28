// Rules for the browser camera's send path. Pure functions and types only, so the
// routes and the camera's panel share one copy and the rules can be unit tested.

export type MemberRole = "owner" | "admin" | "operator";

/** Where a signed-out visitor goes to send photos. Back to the camera after sign-in. */
export const CAMERA_LOGIN_HREF = "/login?next=%2Fcamera";

/** Owners, admins and team members may send a Roll to their studio. */
export function canSendToStudio(role: string | null | undefined): role is MemberRole {
  return role === "owner" || role === "admin" || role === "operator";
}

/** The first membership that may send, or null. */
export function firstSendableMembership<T extends { role: string }>(rows: T[]): T | null {
  return rows.find((row) => canSendToStudio(row.role)) ?? null;
}

/** The membership for one studio, only when it may send. */
export function sendableMembership<T extends { studioId: string; role: string }>(rows: T[], studioId: string): T | null {
  return rows.find((row) => row.studioId === studioId && canSendToStudio(row.role)) ?? null;
}

/** A project name from a request body: trimmed, 1 to 120 characters, or null. */
export function parseProjectName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 120 ? name : null;
}

/** The project a Roll goes to when no project is picked: named for the day it is sent (local date). */
export function dayProjectName(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `Camera ${y}-${m}-${d}`;
}

/**
 * Whether a POST comes from this site. Browsers send Origin on every POST, so a
 * missing or different Origin is refused. This is the guard against a page on
 * another site sending photos with someone's session cookie.
 */
export function isSameOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  try {
    return origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

/** Only JSON bodies are read, so a plain HTML form can't post here. */
export function isJsonBody(contentType: string | null): boolean {
  return (contentType ?? "").split(";")[0].trim().toLowerCase() === "application/json";
}

/** Photo types the studio's photo storage accepts (see the project-photos bucket). */
export const STORABLE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type CameraProject = { id: string; name: string; photoCount: number };

/** What the camera's send panel shows: nobody, a signed-in user with no studio, or a studio with its projects. */
export type CameraState =
  | { signedIn: false }
  | { signedIn: true; email: string | null; studio: null }
  | { signedIn: true; email: string | null; studio: { id: string; name: string; role: MemberRole }; blocked: string | null; projects: CameraProject[] };
