// Daily clean-up: which photos and files are due for deletion.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const P = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

let t: Awaited<ReturnType<typeof openTestDb>>;
let org: string;

const sql = async <T>(q: string) => (await t.db.query<T>(q)).rows;

async function project(slug: string, firstPublished: string | null, expires: string | null) {
  const id = (await t.as<{ id: string }>("authenticated", OWNER, `insert into public.projects (organization_id, name, slug) values ('${org}', '${slug}', '${slug}') returning id`))[0].id;
  // Only the dates matter to the clean-up (publishing itself is tested elsewhere).
  await t.db.exec(`update public.projects set first_published_at = ${firstPublished ?? "null"}, gallery_expires_at = ${expires ?? "null"} where id = '${id}'`);
  return id;
}

async function photo(projectId: string, n: number, edited = false) {
  const base = `${org}/${projectId}/${P(n)}`;
  await t.db.exec(`insert into public.project_photos (id, project_id, file_name, path, thumb_path, edited_path, edited_thumb_path, look, width, height, source)
    values ('${P(n)}', '${projectId}', 'IMG_${n}.jpg', '${base}.jpg', '${base}.thumb.jpg', ${edited ? `'${base}.edit.jpg', '${base}.edit.thumb.jpg', 'golden-glow'` : "null, null, null"}, 10, 10, 'worker')`);
}

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(`insert into auth.users values ('${OWNER}', 'a@a.in')`);
  org = (await t.as<{ id: string }>("authenticated", OWNER, "select public.create_organization('Saltwater', 'saltwater') as id"))[0].id;
  await t.db.exec(`update public.organizations set plan_id = 'starter', status = 'active', paid_until = now() + interval '20 days' where id = '${org}'`);
  await t.db.exec(`update public.plans set events_per_month = 50 where id = 'starter'`); // room for the test projects
});

describe("project photos", () => {
  it("are due 7 days after their gallery closes, not before", async () => {
    const old = await project("closed-long-ago", "now() - interval '30 days'", "now() - interval '23 days'");
    const recent = await project("closed-yesterday", "now() - interval '8 days'", "now() - interval '1 day'");
    const open = await project("still-open", "now() - interval '1 day'", "now() + interval '6 days'");
    const draft = await project("never-shared", null, null);
    await photo(old, 1, true);
    await photo(recent, 2);
    await photo(open, 3);
    await photo(draft, 4);
    const due = await sql<{ photo_id: string; paths: string[] }>(`select * from public.cleanup_project_photos(100)`);
    expect(due.map((d) => d.photo_id)).toEqual([P(1)]);
    expect(due[0].paths).toHaveLength(4);
  });

  it("counts an unpublished gallery as closed when its sharing period ended", async () => {
    const hidden = await project("unpublished", "now() - interval '20 days'", null); // starter: 7 gallery days
    await photo(hidden, 5);
    const ids = (await sql<{ photo_id: string }>(`select photo_id from public.cleanup_project_photos(100)`)).map((r) => r.photo_id);
    expect(ids).toContain(P(5));
  });
});

describe("event photos", () => {
  it("are due 7 days after the event gallery closes, once", async () => {
    const [{ id: event }] = await sql<{ id: string }>(`insert into public.events (organization_id, slug, couple_names, starts_at, ends_at, gallery_expires_at)
      values ('${org}', 'old-wedding', 'A & B', now() - interval '30 days', now() - interval '29 days', now() - interval '20 days') returning id`);
    await t.db.exec(`insert into public.photos (id, event_id, storage_path, thumb_path) values
      ('${P(20)}', '${event}', '${org}/${event}/g/${P(20)}.jpg', '${org}/${event}/g/${P(20)}.thumb.jpg'),
      ('${P(21)}', '${event}', '${org}/${event}/g/${P(21)}.jpg', null)`);
    let due = await sql<{ photo_id: string; paths: string[] }>(`select * from public.cleanup_event_photos(100) order by photo_id`);
    expect(due.map((d) => [d.photo_id, d.paths.length])).toEqual([
      [P(20), 2],
      [P(21), 1],
    ]);
    await t.db.exec(`update public.photos set deleted_at = now() where id = '${P(20)}'`);
    due = await sql(`select * from public.cleanup_event_photos(100)`);
    expect(due).toHaveLength(1);
  });
});

describe("orphan files", () => {
  it("lists day-old files no photo or logo points to", async () => {
    const [{ id: proj }] = await sql<{ id: string }>(`select id from public.projects where slug = 'still-open'`);
    const kept = `${org}/${proj}/${P(3)}.jpg`;
    const orphan = `${org}/${proj}/${P(99)}.jpg`;
    const fresh = `${org}/${proj}/${P(98)}.jpg`;
    const oldLogo = `${org}/logo-00000000.png`;
    await t.db.exec(`insert into storage.objects (bucket_id, name, created_at) values
      ('project-photos', '${kept}', now() - interval '2 days'),
      ('project-photos', '${orphan}', now() - interval '2 days'),
      ('project-photos', '${fresh}', now()),
      ('studio-assets', '${oldLogo}', now() - interval '2 days')`);
    const rows = await sql<{ bucket: string; name: string }>(`select * from public.cleanup_orphan_files(100) order by name`);
    expect(rows).toEqual([
      { bucket: "studio-assets", name: oldLogo },
      { bucket: "project-photos", name: orphan },
    ].sort((a, b) => a.name.localeCompare(b.name)));
  });
});

describe("access", () => {
  it("is server-only", async () => {
    for (const fn of ["cleanup_project_photos(1)", "cleanup_event_photos(1)", "cleanup_orphan_files(1)"]) {
      await expect(t.as("authenticated", OWNER, `select * from public.${fn}`)).rejects.toThrow(/permission denied/);
      await expect(t.as("anon", null, `select * from public.${fn}`)).rejects.toThrow(/permission denied/);
    }
  });
});
