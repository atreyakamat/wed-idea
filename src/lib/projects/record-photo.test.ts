import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { recordProjectPhoto } from "./queries";

const PROJECT = { id: "22222222-2222-4222-8222-222222222222", organization_id: "11111111-1111-4111-8111-111111111111" };
const PHOTO = "33333333-3333-4333-8333-333333333333";
const INPUT = { photoId: PHOTO, fileName: "IMG_1.jpg", width: 2400, height: 1600, bytes: 100, takenAt: null };

function fakes(insertError: { code?: string; message?: string; hint?: string } | null, uploaded = true) {
  const removed: string[][] = [];
  const db = {
    storage: { from: () => ({ list: async () => ({ data: uploaded ? [{ name: `${PHOTO}.jpg` }, { name: `${PHOTO}.thumb.jpg` }] : [] }) }) },
    from: () => ({ insert: async () => ({ error: insertError }) }),
  } as unknown as SupabaseClient;
  const cleanup = { storage: { from: () => ({ remove: async (paths: string[]) => removed.push(paths) }) } } as unknown as SupabaseClient;
  return { db, cleanup, removed };
}

const friendly = (e: { message?: string }) => e.message ?? null;

describe("recordProjectPhoto", () => {
  it("records a finished upload", async () => {
    const { db, cleanup, removed } = fakes(null);
    expect(await recordProjectPhoto(db, cleanup, PROJECT, INPUT, "worker", friendly)).toEqual({ ok: true });
    expect(removed).toEqual([]);
  });

  it("asks for a retry when the files aren't there yet", async () => {
    const { db, cleanup } = fakes(null, false);
    expect(await recordProjectPhoto(db, cleanup, PROJECT, INPUT, "worker", friendly)).toMatchObject({ ok: false, status: 422 });
  });

  it("keeps the files when the same photo was already recorded (lost reply)", async () => {
    const { db, cleanup, removed } = fakes({ code: "23505", message: 'duplicate key value violates unique constraint "project_photos_pkey"' });
    expect(await recordProjectPhoto(db, cleanup, PROJECT, INPUT, "worker", friendly)).toEqual({ ok: true, duplicate: true });
    expect(removed).toEqual([]);
  });

  it("removes the files for a file name that's already there", async () => {
    const { db, cleanup, removed } = fakes({ code: "23505", message: 'duplicate key value violates unique constraint "project_photos_project_id_file_name_key"' });
    expect(await recordProjectPhoto(db, cleanup, PROJECT, INPUT, "worker", friendly)).toEqual({ ok: true, duplicate: true });
    expect(removed).toHaveLength(1);
  });

  it("removes the files and stops on a limit, access or project rule", async () => {
    for (const [hint, status] of [["plan_limit", 403], ["studio_access", 403], ["project_rule", 409]] as const) {
      const { db, cleanup, removed } = fakes({ code: "P0001", hint, message: "No." });
      expect(await recordProjectPhoto(db, cleanup, PROJECT, INPUT, "worker", friendly)).toEqual({ ok: false, error: "No.", status });
      expect(removed).toHaveLength(1);
    }
  });

  it("keeps the files on a temporary error, so a retry can record them", async () => {
    const { db, cleanup, removed } = fakes({ code: "57014", message: "canceling statement due to statement timeout" });
    expect(await recordProjectPhoto(db, cleanup, PROJECT, INPUT, "worker", friendly)).toMatchObject({ ok: false, status: 500 });
    expect(removed).toEqual([]);
  });
});
