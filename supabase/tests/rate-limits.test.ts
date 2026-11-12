import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

let t: Awaited<ReturnType<typeof openTestDb>>;
const hit = async (key: string, limit: number) => (await t.db.query<{ ok: boolean }>(`select public.rate_limit_hit('${key}', ${limit}, 60) as ok`)).rows[0].ok;

beforeAll(async () => {
  t = await openTestDb();
});

describe("rate limits", () => {
  it("allow up to the limit in a window, per key", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hit("heart:1.2.3.4", 3));
    expect(results).toEqual([true, true, true, false]);
    expect(await hit("heart:5.6.7.8", 3)).toBe(true);
  });

  it("prune old windows", async () => {
    await t.db.exec(`insert into public.rate_limit_hits (key, window_start, hits) values ('old', now() - interval '2 days', 5)`);
    expect((await t.db.query<{ n: number }>(`select public.rate_limit_prune() as n`)).rows[0].n).toBe(1);
  });

  it("are server-only", async () => {
    await expect(t.as("anon", null, `select public.rate_limit_hit('x', 1, 60)`)).rejects.toThrow(/permission denied/);
    await expect(t.as("authenticated", "aaaaaaaa-0000-0000-0000-000000000001", `select * from public.rate_limit_hits`)).rejects.toThrow(/permission denied|row-level/);
  });
});
