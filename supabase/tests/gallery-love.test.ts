// Gallery favourites (hearts), photo tones and the studio logo.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OPERATOR = "aaaaaaaa-0000-0000-0000-000000000002";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000001";
const VISITOR = "cccccccc-0000-4000-8000-000000000001";
const VISITOR2 = "cccccccc-0000-4000-8000-000000000002";
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
  for (const n of [1, 2]) {
    const base = `${org}/${project}/${P(n)}`;
    await asOwner(`insert into public.project_photos (id, project_id, file_name, path, thumb_path, tone, width, height, source)
      values ('${P(n)}', '${project}', 'IMG_${n}.jpg', '${base}.jpg', '${base}.thumb.jpg', '#c08850', 2400, 1600, 'browser')`);
  }
});

describe("photo tone", () => {
  it("is a hex colour", async () => {
    const base = `${org}/${project}/${P(9)}`;
    expect(
      (await failure(asOwner(`insert into public.project_photos (id, project_id, file_name, path, thumb_path, tone, width, height, source)
        values ('${P(9)}', '${project}', 'x.jpg', '${base}.jpg', '${base}.thumb.jpg', 'red', 10, 10, 'browser')`))).code,
    ).toBe("23514");
  });
});

describe("hearts", () => {
  it("are written by server code only", async () => {
    expect((await failure(asOwner(`insert into public.project_photo_hearts (photo_id, visitor) values ('${P(1)}', '${VISITOR}')`))).message).toMatch(/row-level security/);
    expect((await failure(t.as("anon", null, `insert into public.project_photo_hearts (photo_id, visitor) values ('${P(1)}', '${VISITOR}')`))).message).toMatch(/permission denied|row-level security/);
    await t.db.exec(`insert into public.project_photo_hearts (photo_id, visitor) values ('${P(1)}', '${VISITOR}'), ('${P(1)}', '${VISITOR2}'), ('${P(2)}', '${VISITOR}')`);
  });

  it("are counted per photo for the studio's members only", async () => {
    const counts = await t.as<{ photo_id: string; hearts: number }>("authenticated", OPERATOR, `select photo_id, hearts::int as hearts from public.project_heart_counts('${project}') order by hearts desc`);
    expect(counts).toEqual([
      { photo_id: P(1), hearts: 2 },
      { photo_id: P(2), hearts: 1 },
    ]);
    expect(await t.as("authenticated", OTHER, `select * from public.project_heart_counts('${project}')`)).toEqual([]);
    expect(await t.count(OTHER, "public.project_photo_hearts")).toBe(0);
    expect(await t.count(OPERATOR, "public.project_photo_hearts")).toBe(3);
  });

  it("can't be doubled by the same visitor", async () => {
    expect((await failure(t.db.query(`insert into public.project_photo_hearts (photo_id, visitor) values ('${P(1)}', '${VISITOR}')`))).code).toBe("23505");
  });

  it("go when the photo is deleted", async () => {
    await asOwner(`delete from public.project_photos where id = '${P(2)}'`);
    expect((await sql<{ n: number }>(`select count(*)::int as n from public.project_photo_hearts where photo_id = '${P(2)}'`))[0].n).toBe(0);
  });
});

describe("studio logo", () => {
  it("is set by managers, inside the studio's folder", async () => {
    await asOwner(`update public.organizations set logo_path = '${org}/logo-0123abcd.png' where id = '${org}'`);
    expect((await failure(asOwner(`update public.organizations set logo_path = '${otherOrg}/logo-0123abcd.png' where id = '${org}'`))).message).toMatch(/own folder/);
    expect((await failure(asOwner(`update public.organizations set logo_path = '${org}/evil.svg' where id = '${org}'`))).code).toBe("23514");
  });

  it("uploads only as a manager, into their own folder, as an image name", async () => {
    const up = (uid: string, name: string) => t.as("authenticated", uid, `insert into storage.objects (bucket_id, name) values ('studio-assets', '${name}')`);
    await up(OWNER, `${org}/logo-0123abcd.png`);
    expect((await failure(up(OPERATOR, `${org}/logo-0123abce.png`))).message).toMatch(/row-level security/);
    expect((await failure(up(OWNER, `${otherOrg}/logo-0123abcf.png`))).message).toMatch(/row-level security/);
    expect((await failure(up(OWNER, `${org}/logo-0123abd0.svg`))).message).toMatch(/row-level security/);
  });
});
