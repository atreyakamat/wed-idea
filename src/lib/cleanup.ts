import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_SECRET_LENGTH = 32;

/** True when the request carries the cron secret ("Authorization: Bearer …"). */
export function isCronRequest(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  const m = /^Bearer\s+(\S+)$/.exec(header?.trim() ?? "");
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type CleanupReport = { projectPhotos: number; eventPhotos: number; orphanFiles: number; errors: string[] };

const BATCH = 500;
const MAX_ROUNDS = 20;

/**
 * Deletes what the clean-up functions list, files first, then rows, in
 * batches. Safe to run again: a half-finished run resumes on the next call.
 */
export async function runCleanup(admin: SupabaseClient): Promise<CleanupReport> {
  const report: CleanupReport = { projectPhotos: 0, eventPhotos: 0, orphanFiles: 0, errors: [] };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await admin.rpc("cleanup_project_photos", { p_limit: BATCH });
    if (error) {
      report.errors.push(`project photos: ${error.message}`);
      break;
    }
    const rows = (data ?? []) as { photo_id: string; paths: string[] }[];
    if (!rows.length) break;
    const removed = await admin.storage.from("project-photos").remove(rows.flatMap((r) => r.paths));
    if (removed.error) {
      report.errors.push(`project files: ${removed.error.message}`);
      break;
    }
    const del = await admin.from("project_photos").delete().in("id", rows.map((r) => r.photo_id));
    if (del.error) {
      report.errors.push(`project rows: ${del.error.message}`);
      break;
    }
    report.projectPhotos += rows.length;
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await admin.rpc("cleanup_event_photos", { p_limit: BATCH });
    if (error) {
      report.errors.push(`event photos: ${error.message}`);
      break;
    }
    const rows = (data ?? []) as { photo_id: string; paths: string[] }[];
    if (!rows.length) break;
    const removed = await admin.storage.from("event-photos").remove(rows.flatMap((r) => r.paths));
    if (removed.error) {
      report.errors.push(`event files: ${removed.error.message}`);
      break;
    }
    const upd = await admin.from("photos").update({ deleted_at: new Date().toISOString() }).in("id", rows.map((r) => r.photo_id));
    if (upd.error) {
      report.errors.push(`event rows: ${upd.error.message}`);
      break;
    }
    report.eventPhotos += rows.length;
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await admin.rpc("cleanup_orphan_files", { p_limit: 1000 });
    if (error) {
      report.errors.push(`orphans: ${error.message}`);
      break;
    }
    const rows = (data ?? []) as { bucket: string; name: string }[];
    if (!rows.length) break;
    for (const bucket of new Set(rows.map((r) => r.bucket))) {
      const names = rows.filter((r) => r.bucket === bucket).map((r) => r.name);
      const removed = await admin.storage.from(bucket).remove(names);
      if (removed.error) report.errors.push(`orphan files in ${bucket}: ${removed.error.message}`);
      else report.orphanFiles += names.length;
    }
    if (report.errors.length) break;
  }

  const pruned = await admin.rpc("rate_limit_prune");
  if (pruned.error) report.errors.push(`rate limits: ${pruned.error.message}`);

  return report;
}
