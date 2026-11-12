// Photo review (versioned edit files) and the studio's learnt style.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OPERATOR = "aaaaaaaa-0000-0000-0000-000000000002";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000001";
const P = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

let t: Awaited<ReturnType<typeof openTestDb>>;
let org: string;
let otherOrg: string;
let project: string;

const asOwner = <T>(q: string) => t.as<T>("authenticated", OWNER, q);
const sql = async <T>(q: string) => (await t.db.query<T>(q)).rows;

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
  await t.db.exec(`insert into auth.users values ('${OWNER}', 'a@a.in'), ('${OPERATOR}', 'o@a.in'), ('${OTHER}', 'b@b.in')`);
  org = (await asOwner<{ id: string }>("select public.create_organization('Saltwater', 'saltwater') as id"))[0].id;
  otherOrg = (await t.as<{ id: string }>("authenticated", OTHER, "select public.create_organization('Other', 'other-studio') as id"))[0].id;
  await asOwner(`insert into public.organization_members (organization_id, user_id, role) values ('${org}', '${OPERATOR}', 'operator')`);
  await t.db.exec(`update public.organizations set plan_id = 'starter', status = 'active', paid_until = now() + interval '20 days' where id = '${org}'`);
  project = (await asOwner<{ id: string }>(`insert into public.projects (organization_id, name, slug) values ('${org}', 'Shoot', 'shoot') returning id`))[0].id;
  const base = `${org}/${project}/${P(1)}`;
  await asOwner(`insert into public.project_photos (id, project_id, file_name, path, thumb_path, width, height, source)
    values ('${P(1)}', '${project}', 'IMG_1.jpg', '${base}.jpg', '${base}.thumb.jpg', 2400, 1600, 'browser')`);
});

describe("versioned edit files", () => {
  const can = (path: string) => t.as<{ ok: boolean }>("authenticated", OPERATOR, `select public.can_upload_project_photo('${path}') as ok`).then((r) => r[0].ok);

  it("may be uploaded by members", async () => {
    const base = `${org}/${project}/${P(1)}`;
    expect(await can(`${base}.edit.ab12cd34.jpg`)).toBe(true);
    expect(await can(`${base}.edit.ab12cd34.thumb.jpg`)).toBe(true);
    expect(await can(`${base}.edit.jpg`)).toBe(true);
  });

  it("must use a short lower-case version", async () => {
    const base = `${org}/${project}/${P(1)}`;
    expect(await can(`${base}.edit.AB12CD34.jpg`)).toBe(false);
    expect(await can(`${base}.edit.ab12.jpg`)).toBe(false);
    expect(await can(`${base}.edit.ab12cd34/../x.jpg`)).toBe(false);
  });

  it("may not go into another studio's project", async () => {
    expect(await t.as<{ ok: boolean }>("authenticated", OTHER, `select public.can_upload_project_photo('${org}/${project}/${P(1)}.edit.ab12cd34.jpg') as ok`).then((r) => r[0].ok)).toBe(false);
  });

  it("can be pointed to by server code only", async () => {
    const base = `${org}/${project}/${P(1)}`;
    expect((await failure(asOwner(`update public.project_photos set edited_path = '${base}.edit.ab12cd34.jpg', edited_thumb_path = '${base}.edit.ab12cd34.thumb.jpg', look = 'honey-film' where id = '${P(1)}'`))).message).toMatch(/visibility/);
    expect((await failure(asOwner(`update public.project_photos set reviewed_at = now() where id = '${P(1)}'`))).message).toMatch(/visibility/);
    await t.db.exec(`update public.project_photos set edited_path = '${base}.edit.ab12cd34.jpg', edited_thumb_path = '${base}.edit.ab12cd34.thumb.jpg', lighting = 'golden', look = 'honey-film', reviewed_at = now() where id = '${P(1)}'`);
    expect((await sql<{ look: string }>(`select look from public.project_photos where id = '${P(1)}'`))[0].look).toBe("honey-film");
  });

  it("still have to be inside the project's folder", async () => {
    expect((await failure(t.db.query(`update public.project_photos set edited_path = '${otherOrg}/x.edit.jpg', edited_thumb_path = '${otherOrg}/x.edit.thumb.jpg' where id = '${P(1)}'`))).message).toMatch(/inside the project/);
  });
});

describe("studio style", () => {
  const style = (user: string) => t.as<{ lighting: string; look: string; picks: number }>("authenticated", user, `select lighting, look, picks from public.studio_style('${org}') order by lighting`);

  it("is recorded by server code only", async () => {
    expect((await failure(asOwner(`select public.record_look_picks('${org}', 'golden', 'honey-film', 5)`))).message).toMatch(/permission denied/);
    expect((await failure(asOwner(`insert into public.studio_look_picks (organization_id, lighting, look, picks) values ('${org}', 'golden', 'honey-film', 9)`))).message).toMatch(/row-level security|permission denied/);
  });

  it("needs a clear favourite", async () => {
    await t.db.exec(`select public.record_look_picks('${org}', 'golden', 'honey-film', 2)`);
    expect(await style(OWNER)).toEqual([]);
    await t.db.exec(`select public.record_look_picks('${org}', 'golden', 'honey-film')`);
    expect(await style(OWNER)).toEqual([{ lighting: "golden", look: "honey-film", picks: 3 }]);
    // Another look picked more often takes over; a near tie still has a winner over 40%.
    await t.db.exec(`select public.record_look_picks('${org}', 'golden', 'warm-haze', 4)`);
    expect(await style(OPERATOR)).toEqual([{ lighting: "golden", look: "warm-haze", picks: 4 }]);
    // Spread thin across looks: no favourite.
    await t.db.exec(`select public.record_look_picks('${org}', 'golden', 'sunset-pop', 3), public.record_look_picks('${org}', 'golden', 'dreamy-bloom', 3)`);
    expect(await style(OWNER)).toEqual([]);
  });

  it("is private to the studio", async () => {
    await t.db.exec(`select public.record_look_picks('${org}', 'night', 'classic-bw', 5)`);
    expect(await style(OTHER)).toEqual([]);
    expect(await t.count(OTHER, "public.studio_look_picks")).toBe(0);
    expect(await t.as("anon", null, `select * from public.studio_style('${org}')`).catch((e: Error) => e.message)).toMatch(/permission denied/);
  });

  it("can be reset by a manager, not an operator", async () => {
    await t.as("authenticated", OPERATOR, `delete from public.studio_look_picks where organization_id = '${org}'`);
    expect(await t.count(OWNER, "public.studio_look_picks")).toBeGreaterThan(0);
    await asOwner(`delete from public.studio_look_picks where organization_id = '${org}'`);
    expect(await t.count(OWNER, "public.studio_look_picks")).toBe(0);
  });
});
