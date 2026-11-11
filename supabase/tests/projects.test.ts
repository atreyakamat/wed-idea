// Projects: fast photo delivery, its limits, the share link and worker tokens.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OPERATOR = "aaaaaaaa-0000-0000-0000-000000000002";
const OTHER_OWNER = "bbbbbbbb-0000-0000-0000-000000000001";
const HASH = (n: number) => n.toString(16).padStart(64, "0");

let t: Awaited<ReturnType<typeof openTestDb>>;
let org: string;
let otherOrg: string;

const asOwner = <T>(q: string) => t.as<T>("authenticated", OWNER, q);
const asOperator = <T>(q: string) => t.as<T>("authenticated", OPERATOR, q);
const asOther = <T>(q: string) => t.as<T>("authenticated", OTHER_OWNER, q);
const asAdmin = <T>(q: string) => t.as<T>("authenticated", ADMIN, q, "aal2");
const sql = async <T>(q: string) => (await t.db.query<T>(q)).rows;
const setOrg = (fields: string, o = org) => t.db.exec(`update public.organizations set ${fields} where id = '${o}'`);

async function failure(p: Promise<unknown>): Promise<{ message: string; hint?: string; code?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { message: string; hint?: string; code?: string };
  }
  throw new Error("Expected the query to fail");
}

async function newProject(slug: string, o = org, as = asOwner) {
  return (await as<{ id: string }>(`insert into public.projects (organization_id, name, slug, kind) values ('${o}', 'Meera''s 30th', '${slug}', 'birthday') returning id`))[0].id;
}

function photoSql(project: string, name: string, o = org) {
  return `insert into public.project_photos (project_id, organization_id, file_name, path, thumb_path, width, height, source)
    values ('${project}', '${o}', '${name}', '${o}/${project}/${name}.jpg', '${o}/${project}/${name}.thumb.jpg', 2400, 1600, 'browser') returning id`;
}

/** Clears this studio's projects, as a test reset (bypasses the delete rule). */
const clearProjects = () => t.db.exec(`delete from public.projects`);

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(`
    insert into auth.users values
      ('${ADMIN}', 'me@cwp.in'), ('${OWNER}', 'asha@saltwater.in'), ('${OPERATOR}', 'ravi@saltwater.in'), ('${OTHER_OWNER}', 'neel@other.in');
  `);
  await t.makeAdmin(ADMIN);
  org = (await asOwner<{ id: string }>("select public.create_organization('Saltwater Studios', 'saltwater') as id"))[0].id;
  otherOrg = (await asOther<{ id: string }>("select public.create_organization('Other Studio', 'other-studio') as id"))[0].id;
  await asOwner(`insert into public.organization_members (organization_id, user_id, role) values ('${org}', '${OPERATOR}', 'operator')`);
});

beforeEach(async () => {
  await clearProjects();
  // Starter: 4 projects a month, 1,500 photos each, 7-day galleries.
  const fresh = `plan_id = 'starter', status = 'active', suspended_at = null, paid_until = now() + interval '20 days'`;
  await setOrg(fresh);
  await setOrg(fresh, otherOrg);
});

describe("projects", () => {
  it("are created by managers as drafts, with a private link token", async () => {
    const id = await newProject("meera-30");
    const [p] = await sql<{ status: string; access_token: string; published_at: string | null }>(
      `select status, access_token, published_at from public.projects where id = '${id}'`,
    );
    expect(p.status).toBe("draft");
    expect(p.access_token).toMatch(/^[0-9a-f]{48}$/);
    expect(p.published_at).toBeNull();
  });

  it("can't be created by operators or for another studio", async () => {
    expect((await failure(newProject("op-made", org, asOperator))).message).toMatch(/row-level security/);
    expect((await failure(newProject("theirs", otherOrg))).message).toMatch(/row-level security/);
  });

  it("start as drafts even if created as published", async () => {
    const [p] = await asOwner<{ status: string }>(
      `insert into public.projects (organization_id, name, slug, status, published_at, gallery_expires_at)
       values ('${org}', 'Sneaky', 'sneaky', 'published', now(), now() + interval '1 year') returning status`,
    );
    expect(p.status).toBe("draft");
  });

  it("are visible to the studio's members only", async () => {
    await newProject("mine");
    expect(await t.count(OPERATOR, "public.projects")).toBe(1);
    expect(await t.count(OTHER_OWNER, "public.projects")).toBe(0);
    expect(await t.count(null, "public.projects", "anon")).toBe(0);
  });

  it("keep their studio, token and dates when a studio edits them", async () => {
    const id = await newProject("locked");
    const before = (await sql<{ access_token: string }>(`select access_token from public.projects where id = '${id}'`))[0];
    await asOwner(`update public.projects set organization_id = '${otherOrg}', access_token = 'abc', name = 'Renamed' where id = '${id}'`);
    const [after] = await sql<{ organization_id: string; access_token: string; name: string }>(
      `select organization_id, access_token, name from public.projects where id = '${id}'`,
    );
    expect(after).toEqual({ organization_id: org, access_token: before.access_token, name: "Renamed" });
  });

  it("count toward the plan's monthly limit, in India time", async () => {
    for (const s of ["one", "two", "three", "four"]) await newProject(s);
    const err = await failure(newProject("five"));
    expect(err.hint).toBe("plan_limit");
    expect(err.message).toMatch(/4 of 4 projects/);
    expect(err.message).toMatch(/Upgrade to Pro for 15 projects a month/);
    // Last month's projects don't count.
    await t.db.exec(`update public.projects set created_at = now() - interval '40 days' where slug = 'one'`);
    await newProject("five");
  });

  it("can't be started once the trial has ended or while suspended", async () => {
    await setOrg(`plan_id = 'trial', status = 'trialing', trial_ends_at = now() - interval '1 day', paid_until = null`);
    const ended = await failure(newProject("late"));
    expect(ended.hint).toBe("studio_access");
    expect(ended.message).toMatch(/trial has ended/);
    await setOrg(`status = 'suspended', suspended_at = now()`);
    expect((await failure(newProject("late"))).message).toMatch(/suspended/);
  });

  it("can still be started in the payment grace week", async () => {
    await setOrg(`paid_until = now() - interval '2 days'`);
    await newProject("grace");
  });
});

describe("project photos", () => {
  it("are added by any member, into the project's own folder", async () => {
    const id = await newProject("photos");
    await asOperator(photoSql(id, "IMG_0001"));
    const [row] = await sql<{ organization_id: string; created_by: string }>(`select organization_id, created_by from public.project_photos`);
    expect(row).toEqual({ organization_id: org, created_by: OPERATOR });
  });

  it("can't point outside the project's folder", async () => {
    const id = await newProject("paths");
    const err = await failure(
      asOwner(`insert into public.project_photos (project_id, file_name, path, thumb_path, width, height, source)
        values ('${id}', 'x', '${otherOrg}/${id}/x.jpg', '${org}/${id}/x.thumb.jpg', 10, 10, 'browser')`),
    );
    expect(err.message).toMatch(/inside the project/);
  });

  it("can't be added to another studio's project", async () => {
    const theirs = await newProject("theirs", otherOrg, asOther);
    expect((await failure(asOwner(photoSql(theirs, "x", otherOrg)))).message).toMatch(/row-level security/);
  });

  it("are unique by file name, so re-uploading a folder adds no duplicates", async () => {
    const id = await newProject("dupes");
    await asOwner(photoSql(id, "IMG_0001"));
    expect((await failure(asOwner(photoSql(id, "IMG_0001")))).code).toBe("23505");
  });

  it("stop at the plan's photos per project, for every writer", async () => {
    await t.db.exec(`update public.plans set photos_per_event = 3 where id = 'starter'`);
    try {
      const id = await newProject("full");
      for (const n of ["a", "b", "c"]) await asOwner(photoSql(id, n));
      const err = await failure(asOwner(photoSql(id, "d")));
      expect(err.hint).toBe("plan_limit");
      expect(err.message).toMatch(/reached 3 photos/);
      // Server code (the worker API) is held to the same limit.
      expect((await failure(t.db.query(photoSql(id, "e")))).hint).toBe("plan_limit");
      // Hidden photos still count.
      await asOwner(`update public.project_photos set hidden = true where file_name = 'a'`);
      expect((await failure(asOwner(photoSql(id, "f")))).hint).toBe("plan_limit");
    } finally {
      await t.db.exec(`update public.plans set photos_per_event = 1500 where id = 'starter'`);
    }
  });

  it("can't be added once access has run out", async () => {
    const id = await newProject("cutoff");
    await setOrg(`paid_until = now() - interval '10 days'`);
    const err = await failure(asOwner(photoSql(id, "x")));
    expect(err.hint).toBe("studio_access");
    expect(err.message).toMatch(/overdue/);
  });

  it("can't be added to an archived project", async () => {
    const id = await newProject("archived");
    await asOwner(`update public.projects set status = 'archived' where id = '${id}'`);
    expect((await failure(asOwner(photoSql(id, "x")))).message).toMatch(/archived/);
  });

  it("only change visibility after upload", async () => {
    const id = await newProject("visibility");
    await asOwner(photoSql(id, "x"));
    await asOperator(`update public.project_photos set hidden = true`);
    expect((await sql<{ hidden: boolean }>(`select hidden from public.project_photos`))[0].hidden).toBe(true);
    expect((await failure(asOwner(`update public.project_photos set path = 'elsewhere.jpg'`))).message).toMatch(/visibility/);
  });

  it("are deleted by managers, not operators", async () => {
    const id = await newProject("deletes");
    await asOwner(photoSql(id, "x"));
    expect(await asOperator(`delete from public.project_photos returning id`)).toHaveLength(0);
    expect(await asOwner(`delete from public.project_photos returning id`)).toHaveLength(1);
  });
});

describe("publishing", () => {
  it("needs at least one visible photo", async () => {
    const id = await newProject("empty");
    const err = await failure(asOwner(`update public.projects set status = 'published' where id = '${id}'`));
    expect(err.hint).toBe("project_rule");
    await asOwner(photoSql(id, "x"));
    await asOwner(`update public.project_photos set hidden = true`);
    expect((await failure(asOwner(`update public.projects set status = 'published' where id = '${id}'`))).message).toMatch(/at least one photo/);
  });

  it("sets the gallery to close after the plan's gallery days", async () => {
    const id = await newProject("publish");
    await asOwner(photoSql(id, "x"));
    await asOwner(`update public.projects set status = 'published', gallery_expires_at = now() + interval '1 year' where id = '${id}'`);
    const [p] = await sql<{ days: number }>(
      `select round(extract(epoch from gallery_expires_at - published_at) / 86400)::int as days from public.projects where id = '${id}'`,
    );
    expect(p.days).toBe(7);
  });

  it("never stretches the gallery by unpublishing and publishing again", async () => {
    const id = await newProject("stretch");
    await asOwner(photoSql(id, "x"));
    await asOwner(`update public.projects set status = 'published' where id = '${id}'`);
    await t.db.exec(`update public.projects set first_published_at = now() - interval '5 days' where id = '${id}'`);
    await asOwner(`update public.projects set status = 'draft' where id = '${id}'`);
    expect((await sql<{ gallery_expires_at: string | null }>(`select gallery_expires_at from public.projects where id = '${id}'`))[0].gallery_expires_at).toBeNull();
    await asOwner(`update public.projects set status = 'published' where id = '${id}'`);
    const [p] = await sql<{ days_left: number }>(
      `select round(extract(epoch from gallery_expires_at - now()) / 86400)::int as days_left from public.projects where id = '${id}'`,
    );
    expect(p.days_left).toBe(2);
    // Once the period is over, it can't be published again.
    await asOwner(`update public.projects set status = 'draft' where id = '${id}'`);
    await t.db.exec(`update public.projects set first_published_at = now() - interval '8 days' where id = '${id}'`);
    expect((await failure(asOwner(`update public.projects set status = 'published' where id = '${id}'`))).message).toMatch(/sharing period has ended/);
  });

  it("is blocked once access has run out", async () => {
    const id = await newProject("blocked");
    await asOwner(photoSql(id, "x"));
    await setOrg(`status = 'suspended', suspended_at = now()`);
    expect((await failure(asOwner(`update public.projects set status = 'published' where id = '${id}'`))).hint).toBe("studio_access");
  });

  it("makes a shared project impossible to delete, only archive", async () => {
    const draft = await newProject("draft-delete");
    expect(await asOwner(`delete from public.projects where id = '${draft}' returning id`)).toHaveLength(1);
    const shared = await newProject("shared");
    await asOwner(photoSql(shared, "x"));
    await asOwner(`update public.projects set status = 'published' where id = '${shared}'`);
    await asOwner(`update public.projects set status = 'draft' where id = '${shared}'`);
    expect((await failure(asOwner(`delete from public.projects where id = '${shared}'`))).message).toMatch(/Archive it instead/);
    await asOwner(`update public.projects set status = 'archived' where id = '${shared}'`);
    // Admins can still delete.
    expect(await asAdmin(`delete from public.projects where id = '${shared}' returning id`)).toHaveLength(1);
  });
});

describe("worker tokens", () => {
  beforeEach(() => t.db.exec(`delete from public.worker_tokens`));

  it("are created by managers, storing only a hash", async () => {
    const [{ id }] = await asOwner<{ id: string }>(`select public.create_worker_token('${org}', 'Studio iMac', '${HASH(1)}', 'a1b2') as id`);
    const rows = await asOwner<{ id: string; name: string; token_hint: string }>(`select id, name, token_hint from public.worker_tokens`);
    expect(rows).toEqual([{ id, name: "Studio iMac", token_hint: "a1b2" }]);
  });

  it("can't be created by operators, other studios or anonymous users", async () => {
    expect((await failure(asOperator(`select public.create_worker_token('${org}', 'PC', '${HASH(2)}', 'abcd')`))).message).toMatch(/owners and admins/);
    expect((await failure(asOther(`select public.create_worker_token('${org}', 'PC', '${HASH(3)}', 'abcd')`))).message).toMatch(/owners and admins/);
    expect((await failure(t.as("anon", null, `select public.create_worker_token('${org}', 'PC', '${HASH(4)}', 'abcd')`))).message).toMatch(/permission denied/);
  });

  it("can't be inserted directly or seen by operators", async () => {
    expect((await failure(asOwner(`insert into public.worker_tokens (organization_id, name, token_hash, token_hint) values ('${org}', 'x', '${HASH(5)}', 'abcd')`))).message).toMatch(/row-level security/);
    await asOwner(`select public.create_worker_token('${org}', 'PC', '${HASH(6)}', 'abcd')`);
    expect(await t.count(OPERATOR, "public.worker_tokens")).toBe(0);
    expect(await t.count(OTHER_OWNER, "public.worker_tokens")).toBe(0);
  });

  it("reject a malformed hash", async () => {
    expect((await failure(asOwner(`select public.create_worker_token('${org}', 'PC', 'plaintext-token', 'abcd')`))).code).toBe("23514");
  });

  it("are capped at 10 connected computers", async () => {
    for (let i = 10; i < 20; i++) await asOwner(`select public.create_worker_token('${org}', 'PC ${i}', '${HASH(i)}', 'abcd')`);
    expect((await failure(asOwner(`select public.create_worker_token('${org}', 'PC 20', '${HASH(20)}', 'abcd')`))).message).toMatch(/up to 10/);
  });

  it("are revoked by managers of the same studio", async () => {
    const [{ id }] = await asOwner<{ id: string }>(`select public.create_worker_token('${org}', 'PC', '${HASH(30)}', 'abcd') as id`);
    expect((await failure(asOther(`select public.revoke_worker_token('${id}')`))).message).toMatch(/already disconnected/);
    await asOwner(`select public.revoke_worker_token('${id}')`);
    expect((await sql<{ revoked: boolean }>(`select revoked_at is not null as revoked from public.worker_tokens where id = '${id}'`))[0].revoked).toBe(true);
  });
});

describe("project storage", () => {
  const upload = (as: typeof asOwner, path: string) =>
    as(`insert into storage.objects (bucket_id, name) values ('project-photos', '${path}') returning id`);

  it("accepts files only inside a live project of the uploader's studio", async () => {
    const id = await newProject("store");
    await upload(asOperator, `${org}/${id}/a.jpg`);
    expect((await failure(upload(asOther, `${org}/${id}/b.jpg`))).message).toMatch(/row-level security/);
    expect((await failure(upload(asOwner, `${org}/not-a-uuid/b.jpg`))).message).toMatch(/row-level security/);
    await asOwner(`update public.projects set status = 'archived' where id = '${id}'`);
    expect((await failure(upload(asOwner, `${org}/${id}/c.jpg`))).message).toMatch(/row-level security/);
  });

  it("refuses uploads once access has run out", async () => {
    const id = await newProject("store-late");
    await setOrg(`status = 'suspended', suspended_at = now()`);
    expect((await failure(upload(asOwner, `${org}/${id}/a.jpg`))).message).toMatch(/row-level security/);
  });

  it("lets only the studio's members read the files", async () => {
    const id = await newProject("store-read");
    await upload(asOwner, `${org}/${id}/r.jpg`);
    const read = (uid: string) => t.as<{ n: number }>("authenticated", uid, `select count(*)::int as n from storage.objects where bucket_id = 'project-photos' and name like '%/r.jpg'`);
    expect((await read(OPERATOR))[0].n).toBe(1);
    expect((await read(OTHER_OWNER))[0].n).toBe(0);
  });
});
