// Team invites: who can make them, joining through one, and the seat limit.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const ADMIN = "aaaaaaaa-0000-0000-0000-000000000002";
const NEWBIE = "aaaaaaaa-0000-0000-0000-000000000003";
const SECOND = "aaaaaaaa-0000-0000-0000-000000000004";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000001";

let t: Awaited<ReturnType<typeof openTestDb>>;
let org: string;

const as = <T>(user: string, q: string) => t.as<T>("authenticated", user, q);
const invite = async (user: string, role: string, label = "Second shooter") =>
  (await as<{ token: string }>(user, `select public.create_invite('${org}', '${role}', '${label}') as token`))[0].token;

async function failure(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { message: string; code?: string };
  }
  throw new Error("Expected the query to fail");
}

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(`insert into auth.users values ('${OWNER}', 'owner@a.in'), ('${ADMIN}', 'admin@a.in'), ('${NEWBIE}', 'new@a.in'), ('${SECOND}', 'two@a.in'), ('${OTHER}', 'b@b.in')`);
  org = (await as<{ id: string }>(OWNER, "select public.create_organization('Saltwater', 'saltwater') as id"))[0].id;
  await as(OTHER, "select public.create_organization('Other', 'other-studio')");
  await t.db.exec(`update public.organizations set plan_id = 'pro', status = 'active', paid_until = now() + interval '20 days' where id = '${org}'`);
  await as(OWNER, `insert into public.organization_members (organization_id, user_id, role) values ('${org}', '${ADMIN}', 'admin')`);
});

describe("making invites", () => {
  it("gives a 48-character token and stores only its hash", async () => {
    const token = await invite(OWNER, "operator");
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    const rows = await t.db.query<{ token_hash: string }>(`select token_hash from public.organization_invites where organization_id = '${org}'`);
    expect(rows.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.rows[0].token_hash).not.toContain(token);
  });

  it("is for owners and admins; only owners invite admins", async () => {
    expect(await invite(ADMIN, "operator")).toMatch(/^[0-9a-f]{48}$/);
    expect((await failure(invite(ADMIN, "admin"))).message).toMatch(/Only the studio owner/);
    expect((await failure(invite(OWNER, "owner"))).message).toMatch(/admin or an operator/);
    expect((await failure(as(OTHER, `select public.create_invite('${org}', 'operator')`))).message).toMatch(/Only studio owners and admins/);
    expect((await failure(t.as("anon", null, `select public.create_invite('${org}', 'operator')`))).message).toMatch(/permission denied/);
  });

  it("are visible to managers only", async () => {
    expect(await t.count(OWNER, "public.organization_invites")).toBe(2);
    expect(await t.count(OTHER, "public.organization_invites")).toBe(0);
    expect((await failure(as(OWNER, `insert into public.organization_invites (organization_id, role, token_hash) values ('${org}', 'admin', '${"a".repeat(64)}')`))).message).toMatch(/row-level security|permission denied/);
  });
});

describe("the invite page", () => {
  it("previews an invite for anyone with the link, and nothing for a wrong one", async () => {
    const token = await invite(OWNER, "admin");
    expect(await t.as("anon", null, `select studio_name, role, state from public.invite_preview('${token}')`)).toEqual([{ studio_name: "Saltwater", role: "admin", state: "open" }]);
    expect(await t.as("anon", null, `select * from public.invite_preview('${"0".repeat(48)}')`)).toEqual([]);
    expect(await t.as("anon", null, `select * from public.invite_preview('not-a-token')`)).toEqual([]);
  });
});

describe("joining", () => {
  it("adds the person with the invite's role, once", async () => {
    const token = await invite(OWNER, "operator");
    expect((await as<{ id: string }>(NEWBIE, `select public.accept_invite('${token}') as id`))[0].id).toBe(org);
    expect((await t.db.query<{ role: string }>(`select role from public.organization_members where user_id = '${NEWBIE}'`)).rows[0].role).toBe("operator");
    // Opening the same link again is harmless for the member…
    expect((await as<{ id: string }>(NEWBIE, `select public.accept_invite('${token}') as id`))[0].id).toBe(org);
    // …but nobody else can use it.
    expect((await failure(as(SECOND, `select public.accept_invite('${token}')`))).message).toMatch(/already been used/);
    expect(await t.as("anon", null, `select state from public.invite_preview('${token}')`)).toEqual([{ state: "used" }]);
  });

  it("refuses expired links, wrong links, signed-out visitors and people in another studio", async () => {
    const token = await invite(OWNER, "operator");
    await t.db.exec(`update public.organization_invites set expires_at = now() - interval '1 minute' where accepted_at is null`);
    expect((await failure(as(SECOND, `select public.accept_invite('${token}')`))).message).toMatch(/expired/);
    expect((await failure(as(SECOND, `select public.accept_invite('${"0".repeat(48)}')`))).message).toMatch(/isn't valid/);
    const fresh = await invite(OWNER, "operator");
    expect((await failure(t.as("anon", null, `select public.accept_invite('${fresh}')`))).message).toMatch(/permission denied/);
    expect((await failure(as(OTHER, `select public.accept_invite('${fresh}')`))).message).toMatch(/already belongs to a studio/);
  });

  it("respects the plan's seats", async () => {
    await t.db.exec(`update public.plans set team_seats = 4 where id = 'pro'`);
    const last = await invite(OWNER, "operator");
    await as(SECOND, `select public.accept_invite('${last}')`);
    expect((await failure(invite(OWNER, "operator"))).message).toMatch(/Every seat on your plan is taken/);
  });

  it("can be cancelled by a manager before it's used", async () => {
    await t.db.exec(`update public.plans set team_seats = 10 where id = 'pro'`);
    const token = await invite(OWNER, "operator", "Cancel me");
    await as(ADMIN, `delete from public.organization_invites where label = 'Cancel me'`);
    expect(await t.as("anon", null, `select * from public.invite_preview('${token}')`)).toEqual([]);
    // Used invites stay as a record.
    await as(OWNER, `delete from public.organization_invites where accepted_at is not null`);
    expect((await t.db.query<{ n: number }>(`select count(*)::int as n from public.organization_invites where accepted_at is not null`)).rows[0].n).toBe(2);
  });
});

describe("the team list", () => {
  it("shows members' emails to members only", async () => {
    const team = await as<{ email: string; role: string }>(NEWBIE, `select email, role from public.studio_team('${org}')`);
    expect(team.map((m) => `${m.role}:${m.email}`)).toEqual(["owner:owner@a.in", "admin:admin@a.in", "operator:new@a.in", "operator:two@a.in"]);
    expect(await as(OTHER, `select * from public.studio_team('${org}')`)).toEqual([]);
  });
});
