// Platform admin rules: MFA-only admin powers, studio status, suspension,
// trials, the audit log and the admin read functions.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const OWNER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const OPERATOR_A = "aaaaaaaa-0000-0000-0000-000000000002";
const OWNER_B = "bbbbbbbb-0000-0000-0000-000000000001";

let t: Awaited<ReturnType<typeof openTestDb>>;
let orgA: string;
let orgB: string;
let eventA: string;
let adminFactor: string;

const asAdmin = <T>(sql: string) => t.as<T>("authenticated", ADMIN, sql, "aal2");

function eventSql(org: string, slug: string) {
  return `insert into public.events (organization_id, slug, couple_names, starts_at, ends_at, orders_open_at, orders_close_at, gallery_expires_at, print_price_paise)
    values ('${org}', '${slug}', 'Priya & Rahul', '2026-12-12 09:00+05:30', '2026-12-12 17:00+05:30',
            '2026-12-12 09:00+05:30', '2026-12-12 17:00+05:30', '2026-12-19 17:00+05:30', 4900) returning id`;
}

const studio = async (org: string) =>
  (await t.db.query<{ status: string; trial_ends_at: string; suspended_at: string | null; suspended_reason: string | null }>(
    `select status, trial_ends_at, suspended_at, suspended_reason from public.organizations where id = '${org}'`,
  )).rows[0];

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(`
    insert into auth.users values
      ('${ADMIN}', 'me@cwp.in'), ('${OWNER_A}', 'asha@saltwater.in'), ('${OPERATOR_A}', 'ravi@saltwater.in'), ('${OWNER_B}', 'neel@other.in');
  `);
  adminFactor = await t.makeAdmin(ADMIN);
  orgA = (await t.as<{ id: string }>("authenticated", OWNER_A, "select public.create_organization('Saltwater Studios', 'saltwater') as id"))[0].id;
  orgB = (await t.as<{ id: string }>("authenticated", OWNER_B, "select public.create_organization('Other Studio', 'other-studio') as id"))[0].id;
  await t.as("authenticated", OWNER_A, `insert into public.organization_members (organization_id, user_id, role) values ('${orgA}', '${OPERATOR_A}', 'operator')`);
  eventA = (await t.as<{ id: string }>("authenticated", OWNER_A, eventSql(orgA, "priya-rahul")))[0].id;
  await t.db.exec(`
    insert into storage.objects (bucket_id, name, metadata) values
      ('event-photos', '${orgA}/${eventA}/a.jpg', '{"size": 300000}'),
      ('event-photos', '${orgA}/${eventA}/a.thumb.jpg', '{"size": 50000}');
  `);
});

describe("admin powers need two-step sign-in", () => {
  it("gives a password-only admin session no admin access", async () => {
    expect(await t.count(ADMIN, "public.organizations", "authenticated", "aal1")).toBe(0);
    await expect(t.as("authenticated", ADMIN, "select public.admin_overview()", "aal1")).rejects.toThrow(/admins only/i);
  });

  it("gives an MFA admin session access to every studio", async () => {
    expect(await t.count(ADMIN, "public.organizations", "authenticated", "aal2")).toBe(2);
  });

  it("keeps admin functions closed to studio owners, even with MFA", async () => {
    for (const sql of [
      "select public.admin_overview()",
      "select * from public.admin_studios()",
      `select * from public.admin_studio_members('${orgA}')`,
      "select * from public.admin_events()",
      "select * from public.admin_audit_entries()",
      `select public.admin_set_studio_status('${orgB}', 'active')`,
      `select public.admin_extend_trial('${orgA}', 30)`,
    ]) {
      await expect(t.as("authenticated", OWNER_A, sql, "aal2"), sql).rejects.toThrow(/admins only/i);
    }
  });

  it("keeps the admin list closed to everyone through the API", async () => {
    const rows = await t.as("authenticated", OWNER_A, `insert into public.admin_users values ('${OWNER_A}') returning user_id`, "aal2").catch(() => []);
    expect(rows).toHaveLength(0);
  });
});

describe("studio status", () => {
  it("starts new studios on a 14-day trial", async () => {
    const s = await studio(orgA);
    expect(s.status).toBe("trialing");
    const days = (new Date(s.trial_ends_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
  });

  it("lets owners rename their studio but not change its status or trial", async () => {
    await t.as("authenticated", OWNER_A, `update public.organizations set name = 'Saltwater Studio' where id = '${orgA}'`);
    await expect(
      t.as("authenticated", OWNER_A, `update public.organizations set status = 'active' where id = '${orgA}'`),
    ).rejects.toThrow(/only platform admins/i);
    await expect(
      t.as("authenticated", OWNER_A, `update public.organizations set trial_ends_at = now() + interval '1 year' where id = '${orgA}'`),
    ).rejects.toThrow(/only platform admins/i);
  });

  it("makes even admins go through the audited functions", async () => {
    await expect(asAdmin(`update public.organizations set status = 'active' where id = '${orgB}'`)).rejects.toThrow(/only platform admins/i);
  });
});

describe("suspending a studio", () => {
  it("needs a reason", async () => {
    await expect(asAdmin(`select public.admin_set_studio_status('${orgA}', 'suspended', '  ')`)).rejects.toThrow(/reason/i);
  });

  it("suspends and records who did it and why", async () => {
    await asAdmin(`select public.admin_set_studio_status('${orgA}', 'suspended', 'Chargeback on last invoice')`);
    const s = await studio(orgA);
    expect(s.status).toBe("suspended");
    expect(s.suspended_at).not.toBeNull();
    expect(s.suspended_reason).toBe("Chargeback on last invoice");

    const log = await asAdmin<{ action: string; actor_email: string; studio_name: string; details: Record<string, string> }>(
      `select action, actor_email, studio_name, details from public.admin_audit_entries('${orgA}')`,
    );
    expect(log[0]).toEqual({
      action: "studio.status_changed",
      actor_email: "me@cwp.in",
      studio_name: "Saltwater Studio",
      details: { from: "trialing", to: "suspended", reason: "Chargeback on last invoice" },
    });
  });

  it("stops new events, going live, and capture", async () => {
    await expect(t.as("authenticated", OWNER_A, eventSql(orgA, "new-wedding"))).rejects.toThrow(/suspended/i);
    await expect(
      t.as("authenticated", OWNER_A, `update public.events set status = 'live' where id = '${eventA}'`),
    ).rejects.toThrow(/suspended/i);
    await expect(
      t.as(
        "authenticated",
        OPERATOR_A,
        `insert into public.guests (event_id, code, phone_e164, consent_at) values ('${eventA}', 'B22', '+919800000001', now())`,
      ),
    ).rejects.toThrow(/suspended/i);
  });

  it("still lets the studio see and edit its existing events", async () => {
    expect(await t.count(OWNER_A, "public.events")).toBe(1);
    const rows = await t.as("authenticated", OWNER_A, `update public.events set backdrop_brief = 'Ivory drapes' where id = '${eventA}' returning id`);
    expect(rows).toHaveLength(1);
  });

  it("doesn't affect other studios", async () => {
    const rows = await t.as<{ id: string }>("authenticated", OWNER_B, eventSql(orgB, "other-wedding"));
    expect(rows).toHaveLength(1);
  });

  it("reactivates and clears the suspension", async () => {
    await expect(asAdmin(`select public.admin_set_studio_status('${orgA}', 'active')`)).rejects.toThrow(/paid plan/i);
    await asAdmin(`select public.admin_set_plan('${orgA}', 'starter')`);
    await asAdmin(`select public.admin_set_studio_status('${orgA}', 'active')`);
    const s = await studio(orgA);
    expect(s).toMatchObject({ status: "active", suspended_at: null, suspended_reason: null });
    const rows = await t.as<{ id: string }>("authenticated", OWNER_A, eventSql(orgA, "new-wedding"));
    expect(rows).toHaveLength(1);
  });

  it("logs nothing when the status doesn't change", async () => {
    const before = (await asAdmin<{ n: number }>("select count(*)::int as n from public.admin_audit_log"))[0].n;
    await asAdmin(`select public.admin_set_studio_status('${orgA}', 'active')`);
    const after = (await asAdmin<{ n: number }>("select count(*)::int as n from public.admin_audit_log"))[0].n;
    expect(after).toBe(before);
  });
});

describe("trials", () => {
  it("extends only trials, by 1 to 90 days", async () => {
    await expect(asAdmin(`select public.admin_extend_trial('${orgA}', 14)`)).rejects.toThrow(/only studios on a trial/i);
    await expect(asAdmin(`select public.admin_extend_trial('${orgB}', 0)`)).rejects.toThrow(/1 to 90/);
    await expect(asAdmin(`select public.admin_extend_trial('${orgB}', 91)`)).rejects.toThrow(/1 to 90/);
  });

  it("restarts an expired trial from today", async () => {
    await t.db.exec(`update public.organizations set trial_ends_at = now() - interval '20 days' where id = '${orgB}'`);
    await asAdmin(`select public.admin_extend_trial('${orgB}', 7)`);
    const days = (new Date((await studio(orgB)).trial_ends_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    const [entry] = await asAdmin<{ action: string; details: { days: number } }>(`select action, details from public.admin_audit_entries('${orgB}')`);
    expect(entry.action).toBe("studio.trial_extended");
    expect(entry.details.days).toBe(7);
  });
});

describe("audit log", () => {
  it("can't be written, edited or deleted through the API", async () => {
    await expect(asAdmin(`insert into public.admin_audit_log (action) values ('fake')`)).rejects.toThrow();
    expect(await asAdmin("update public.admin_audit_log set action = 'edited' returning id")).toHaveLength(0);
    expect(await asAdmin("delete from public.admin_audit_log returning id")).toHaveLength(0);
  });

  it("is hidden from studio owners", async () => {
    expect(await t.count(OWNER_A, "public.admin_audit_log", "authenticated", "aal2")).toBe(0);
  });
});

describe("admin reads", () => {
  it("lists studios with owner, usage and storage", async () => {
    const [row] = await asAdmin<Record<string, unknown>>(`select * from public.admin_studios(p_org => '${orgA}')`);
    expect(row).toMatchObject({
      name: "Saltwater Studio",
      status: "active",
      owner_email: "asha@saltwater.in",
      member_count: 2,
      event_count: 2,
      live_event_count: 0,
      storage_bytes: 350000,
    });
  });

  it("searches studios by owner email and filters by status", async () => {
    expect((await asAdmin<{ slug: string }>("select slug from public.admin_studios('NEEL@')")).map((r) => r.slug)).toEqual(["other-studio"]);
    expect((await asAdmin<{ slug: string }>("select slug from public.admin_studios(p_status => 'trialing')")).map((r) => r.slug)).toEqual(["other-studio"]);
  });

  it("lists a studio's members with emails", async () => {
    const rows = await asAdmin<{ email: string; role: string }>(`select email, role from public.admin_studio_members('${orgA}')`);
    expect(rows).toEqual([
      { email: "asha@saltwater.in", role: "owner" },
      { email: "ravi@saltwater.in", role: "operator" },
    ]);
  });

  it("lists events across studios", async () => {
    const rows = await asAdmin<{ studio_name: string }>("select studio_name from public.admin_events() order by studio_name");
    expect(rows.map((r) => r.studio_name)).toEqual(["Other Studio", "Saltwater Studio", "Saltwater Studio"]);
    expect(await asAdmin("select * from public.admin_events('live')")).toHaveLength(0);
  });

  it("summarises the platform", async () => {
    const [{ o }] = await asAdmin<{ o: Record<string, unknown> & { signups_by_week: unknown[] } }>("select public.admin_overview() as o");
    expect(o).toMatchObject({
      studios: { total: 2, active: 1, trialing: 1, suspended: 0, new_30d: 2 },
      events: { total: 3, draft: 3, live: 0 },
      storage_bytes: 350000,
    });
    expect(o.signups_by_week).toHaveLength(12);
  });
});

describe("internal helpers stay internal", () => {
  it.each([
    "select * from public.studio_storage_bytes()",
    "select public.assert_admin()",
    "select public.write_audit('fake', null, '{}')",
  ])("refuses %s to visitors and studio owners", async (sql) => {
    await expect(t.as("anon", null, sql)).rejects.toThrow(/permission denied/i);
    await expect(t.as("authenticated", OWNER_A, sql, "aal2")).rejects.toThrow(/permission denied/i);
  });

  it("only tells members whether their own studio is suspended", async () => {
    await t.db.exec(`update public.organizations set status = 'suspended', suspended_at = now(), suspended_reason = 'x' where id = '${orgB}'`);
    await expect(t.as("anon", null, `select public.is_studio_suspended('${orgB}')`)).rejects.toThrow(/permission denied/i);
    const [{ s }] = await t.as<{ s: boolean }>("authenticated", OWNER_A, `select public.is_studio_suspended('${orgB}') as s`);
    expect(s).toBe(false);
    await t.db.exec(`update public.organizations set status = 'trialing', suspended_at = null, suspended_reason = null where id = '${orgB}'`);
  });
});

describe("admin access is tied to the registered authenticator", () => {
  it("ignores an aal2 session once the registered authenticator is gone", async () => {
    await t.db.exec(`update auth.mfa_factors set status = 'unverified' where id = '${adminFactor}'`);
    expect(await t.count(ADMIN, "public.organizations", "authenticated", "aal2")).toBe(0);
    await t.db.exec(`update auth.mfa_factors set status = 'verified' where id = '${adminFactor}'`);
    expect(await t.count(ADMIN, "public.organizations", "authenticated", "aal2")).toBe(2);
  });

  it("gives an admin row without a registered authenticator nothing", async () => {
    const NEW_ADMIN = "33333333-3333-3333-3333-333333333333";
    await t.db.exec(`
      insert into auth.users values ('${NEW_ADMIN}', 'new@cwp.in');
      insert into auth.mfa_factors (user_id) values ('${NEW_ADMIN}');
      insert into public.admin_users (user_id) values ('${NEW_ADMIN}');
    `);
    expect(await t.count(NEW_ADMIN, "public.organizations", "authenticated", "aal2")).toBe(0);
  });

  it("removes authenticators planted before the admin was added", async () => {
    expect(
      (await t.db.query<{ n: number }>("select count(*)::int as n from auth.mfa_factors where user_id = '33333333-3333-3333-3333-333333333333'")).rows[0].n,
    ).toBe(0);
  });

  it("ignores an aal2 session that used a different authenticator", async () => {
    const other = (await t.db.query<{ id: string }>(`insert into auth.mfa_factors (user_id) values ('${ADMIN}') returning id`)).rows[0].id;
    await t.db.exec(`update auth.sessions set factor_id = '${other}' where id = '${ADMIN}'`);
    expect(await t.count(ADMIN, "public.organizations", "authenticated", "aal2")).toBe(0);
    await t.db.exec(`update auth.sessions set factor_id = '${adminFactor}' where id = '${ADMIN}'; delete from auth.mfa_factors where id = '${other}'`);
    expect(await t.count(ADMIN, "public.organizations", "authenticated", "aal2")).toBe(2);
  });

  it("opens authenticator setup for an hour when an admin is added", async () => {
    const [{ minutes }] = (
      await t.db.query<{ minutes: number }>(
        "select round(extract(epoch from mfa_setup_until - now()) / 60)::int as minutes from public.admin_users where user_id = '33333333-3333-3333-3333-333333333333'",
      )
    ).rows;
    expect(minutes).toBe(60);
  });
});

describe("suspension has no back doors", () => {
  let guestId: string;
  let photoId: string;

  beforeAll(async () => {
    await asAdmin(`select public.admin_set_studio_status('${orgA}', 'active')`);
    guestId = (
      await t.as<{ id: string }>(
        "authenticated",
        OPERATOR_A,
        `insert into public.guests (event_id, code, phone_e164, consent_at) values ('${eventA}', 'C33', '+919800000003', now()) returning id`,
      )
    )[0].id;
    photoId = (
      await t.as<{ id: string }>(
        "authenticated",
        OPERATOR_A,
        `insert into public.photos (event_id, guest_id, storage_path) values ('${eventA}', '${guestId}', '${orgA}/${eventA}/c.jpg') returning id`,
      )
    )[0].id;
    // Owner A also manages studio B, to prove the move is refused by the
    // trigger and not just by row-level security.
    await t.db.exec(`insert into public.organization_members (organization_id, user_id, role) values ('${orgB}', '${OWNER_A}', 'admin')`);
    await asAdmin(`select public.admin_set_studio_status('${orgA}', 'suspended', 'Testing back doors')`);
  });

  it("won't move an event into another studio", async () => {
    await expect(
      t.as("authenticated", OWNER_A, `update public.events set organization_id = '${orgB}' where id = '${eventA}'`),
    ).rejects.toThrow(/can't be moved/i);
  });

  it("won't open a new studio while suspended", async () => {
    await expect(t.as("authenticated", OWNER_A, "select public.create_organization('Fresh Start', 'fresh-start')")).rejects.toThrow(/suspended/i);
  });

  it("won't let guests or photos be changed", async () => {
    await expect(
      t.as("authenticated", OPERATOR_A, `update public.guests set phone_e164 = '+919800000004', name = 'New guest' where id = '${guestId}'`),
    ).rejects.toThrow(/suspended/i);
    await expect(
      t.as("authenticated", OPERATOR_A, `update public.photos set storage_path = '${orgA}/${eventA}/d.jpg' where id = '${photoId}'`),
    ).rejects.toThrow(/suspended/i);
  });

  it("won't take uploads, but files can still be read", async () => {
    await t.db.exec(`insert into storage.objects (bucket_id, name) values ('event-photos', '${orgA}/${eventA}/existing.jpg')`);
    await expect(
      t.as("authenticated", OPERATOR_A, `insert into storage.objects (bucket_id, name) values ('event-photos', '${orgA}/${eventA}/new.jpg')`),
    ).rejects.toThrow();
    expect(await t.count(OPERATOR_A, `storage.objects where name = '${orgA}/${eventA}/existing.jpg'`)).toBe(1);
  });

  it("still lets a photo be hidden", async () => {
    const rows = await t.as("authenticated", OPERATOR_A, `update public.photos set deleted_at = now() where id = '${photoId}' returning id`);
    expect(rows).toHaveLength(1);
  });

  it("lets uploads resume after reactivation", async () => {
    await asAdmin(`select public.admin_set_studio_status('${orgA}', 'active')`);
    const rows = await t.as("authenticated", OPERATOR_A, `insert into storage.objects (bucket_id, name) values ('event-photos', '${orgA}/${eventA}/new.jpg') returning id`);
    expect(rows).toHaveLength(1);
  });
});

describe("studios per account", () => {
  it("allows one studio per account", async () => {
    await expect(t.as("authenticated", OWNER_B, "select public.create_organization('Second', 'second-studio')")).rejects.toThrow(/already have a studio/i);
  });
});

describe("audit history", () => {
  it("keeps the studio's name after the studio is deleted", async () => {
    await t.db.exec(`delete from public.organizations where id = '${orgB}'`);
    const rows = await asAdmin<{ studio_name: string; action: string }>(`select studio_name, action from public.admin_audit_entries('${orgB}')`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.studio_name === "Other Studio")).toBe(true);
  });
});
