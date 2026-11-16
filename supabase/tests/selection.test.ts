// Selection-only galleries: off by default; only studio managers can switch it.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OPERATOR = "aaaaaaaa-0000-0000-0000-000000000002";

let t: Awaited<ReturnType<typeof openTestDb>>;
let project: string;

const sql = async <T>(q: string) => (await t.db.query<T>(q)).rows;

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(`insert into auth.users values ('${OWNER}', 'a@a.in'), ('${OPERATOR}', 'o@a.in')`);
  const org = (await t.as<{ id: string }>("authenticated", OWNER, "select public.create_organization('Saltwater', 'saltwater') as id"))[0].id;
  await t.as("authenticated", OWNER, `insert into public.organization_members (organization_id, user_id, role) values ('${org}', '${OPERATOR}', 'operator')`);
  await t.db.exec(`update public.organizations set plan_id = 'starter', status = 'active', paid_until = now() + interval '20 days' where id = '${org}'`);
  project = (await t.as<{ id: string }>("authenticated", OWNER, `insert into public.projects (organization_id, name, slug) values ('${org}', 'Shoot', 'shoot') returning id`))[0].id;
});

describe("selection only", () => {
  it("is off for a new gallery", async () => {
    expect((await sql<{ selection_only: boolean }>(`select selection_only from public.projects where id = '${project}'`))[0].selection_only).toBe(false);
  });

  it("an operator (not a manager) cannot switch it on", async () => {
    await t.as("authenticated", OPERATOR, `update public.projects set selection_only = true where id = '${project}'`);
    expect((await sql<{ selection_only: boolean }>(`select selection_only from public.projects where id = '${project}'`))[0].selection_only).toBe(false);
  });

  it("an owner can switch it on and off", async () => {
    await t.as("authenticated", OWNER, `update public.projects set selection_only = true where id = '${project}'`);
    expect((await sql<{ selection_only: boolean }>(`select selection_only from public.projects where id = '${project}'`))[0].selection_only).toBe(true);
    await t.as("authenticated", OWNER, `update public.projects set selection_only = false where id = '${project}'`);
    expect((await sql<{ selection_only: boolean }>(`select selection_only from public.projects where id = '${project}'`))[0].selection_only).toBe(false);
  });
});
