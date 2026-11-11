// Auto-edited project photos: edited paths, lighting and look.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000001";
const P = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

let t: Awaited<ReturnType<typeof openTestDb>>;
let org: string;
let otherOrg: string;
let project: string;

const asOwner = <T>(q: string) => t.as<T>("authenticated", OWNER, q);

async function failure(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { message: string; code?: string };
  }
  throw new Error("Expected the query to fail");
}

function photo(n: number, extra: { edited?: string | null; lighting?: string | null; look?: string | null } = {}) {
  const base = `${org}/${project}/${P(n)}`;
  const edited = extra.edited === undefined ? `'${base}.edit.jpg'` : extra.edited === null ? "null" : `'${extra.edited}'`;
  const editedThumb = extra.edited === null ? "null" : `'${base}.edit.thumb.jpg'`;
  const q = (v: string | null | undefined, d: string) => (v === undefined ? `'${d}'` : v === null ? "null" : `'${v}'`);
  return `insert into public.project_photos (id, project_id, file_name, path, thumb_path, edited_path, edited_thumb_path, lighting, look, width, height, source)
    values ('${P(n)}', '${project}', 'IMG_${n}.jpg', '${base}.jpg', '${base}.thumb.jpg', ${edited}, ${editedThumb}, ${q(extra.lighting, "golden")}, ${q(extra.look, "golden-glow")}, 2400, 1600, 'worker')`;
}

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(`insert into auth.users values ('${OWNER}', 'a@a.in'), ('${OTHER}', 'b@b.in')`);
  org = (await asOwner<{ id: string }>("select public.create_organization('Saltwater', 'saltwater') as id"))[0].id;
  otherOrg = (await t.as<{ id: string }>("authenticated", OTHER, "select public.create_organization('Other', 'other-studio') as id"))[0].id;
  await t.db.exec(`update public.organizations set plan_id = 'starter', status = 'active', paid_until = now() + interval '20 days' where id = '${org}'`);
  project = (await asOwner<{ id: string }>(`insert into public.projects (organization_id, name, slug) values ('${org}', 'Shoot', 'shoot') returning id`))[0].id;
});

describe("edited photos", () => {
  it("record the edited files, light and look", async () => {
    await asOwner(photo(1));
    const [row] = await t.db.query<{ lighting: string; look: string; edited_path: string }>(`select lighting, look, edited_path from public.project_photos where id = '${P(1)}'`).then((r) => r.rows);
    expect(row).toEqual({ lighting: "golden", look: "golden-glow", edited_path: `${org}/${project}/${P(1)}.edit.jpg` });
  });

  it("can still be plain, with no edit", async () => {
    await asOwner(photo(2, { edited: null, lighting: null, look: null }));
  });

  it("need both edited files, and a look only with an edit", async () => {
    expect((await failure(asOwner(photo(3, { edited: null })))).code).toBe("23514");
    const base = `${org}/${project}/${P(4)}`;
    expect(
      (await failure(asOwner(`insert into public.project_photos (id, project_id, file_name, path, thumb_path, edited_path, width, height, source)
        values ('${P(4)}', '${project}', 'x.jpg', '${base}.jpg', '${base}.thumb.jpg', '${base}.edit.jpg', 10, 10, 'worker')`))).code,
    ).toBe("23514");
  });

  it("reject unknown lighting and malformed look names", async () => {
    expect((await failure(asOwner(photo(5, { lighting: "disco" })))).code).toBe("23514");
    expect((await failure(asOwner(photo(6, { look: "Golden Glow!" })))).code).toBe("23514");
  });

  it("keep edited files inside the project's folder", async () => {
    expect((await failure(asOwner(photo(7, { edited: `${otherOrg}/${project}/${P(7)}.edit.jpg` })))).message).toMatch(/inside the project/);
  });

  it("can't have their edit swapped by a studio after upload", async () => {
    expect((await failure(asOwner(`update public.project_photos set look = 'honey-film' where id = '${P(1)}'`))).message).toMatch(/visibility/);
  });

  it("are allowed in storage under .edit names", async () => {
    await asOwner(`insert into storage.objects (bucket_id, name) values ('project-photos', '${org}/${project}/${P(9)}.edit.jpg'), ('project-photos', '${org}/${project}/${P(9)}.edit.thumb.jpg')`);
    expect(
      (await failure(asOwner(`insert into storage.objects (bucket_id, name) values ('project-photos', '${org}/${project}/${P(9)}.edited.jpg')`))).message,
    ).toMatch(/row-level security/);
  });
});
