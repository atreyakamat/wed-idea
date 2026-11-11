import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Worker tokens connect the PC app to a studio. The database stores only the
// SHA-256 hash; the token is shown to the studio once.

export const WORKER_TOKEN_PATTERN = /^cwp_wk_[0-9a-f]{48}$/;

export function hashWorkerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function makeWorkerToken(): { token: string; hash: string; hint: string } {
  const token = `cwp_wk_${randomBytes(24).toString("hex")}`;
  return { token, hash: hashWorkerToken(token), hint: token.slice(-4) };
}

/** The token from an "Authorization: Bearer cwp_wk_…" header, or null. */
export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  return m && WORKER_TOKEN_PATTERN.test(m[1]) ? m[1] : null;
}
