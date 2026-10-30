// Plans, limits, trial/payment access, payments and upgrade requests.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OPERATOR = "aaaaaaaa-0000-0000-0000-000000000002";
const OTHER_OWNER = "bbbbbbbb-0000-0000-0000-000000000001";
const SPARE = ["cccccccc-0000-0000-0000-000000000001", "cccccccc-0000-0000-0000-000000000002"];

let t: Awaited<ReturnType<typeof openTestDb>>;
let org: string;
let otherOrg: string;

const asAdmin = <T>(sql: string) => t.as<T>("authenticated", ADMIN, sql, "aal2");
const asOwner = <T>(sql: string) => t.as<T>("authenticated", OWNER, sql);
const sql = async <T>(q: string) => (await t.db.query<T>(q)).rows;

function eventSql(o: string, slug: string, starts = "2026-12-12 09:00+05:30", ends = "2026-12-12 17:00+05:30", galleryDays = 7) {
  return `insert into public.events (organization_id, slug, couple_names, starts_at, ends_at, orders_open_at, orders_close_at, gallery_expires_at, print_price_paise)
    values ('${o}', '${slug}', 'Priya & Rahul', '${starts}', '${ends}', '${starts}', '${ends}', timestamptz '${ends}' + interval '${galleryDays} days', 4900) returning id`;
}

/** The database error a promise rejected with. */
async function failure(p: Promise<unknown>): Promise<{ message: string; hint?: string; code?: string }> {
  try {
    await p;
  } catch (e) {
    return e as { message: string; hint?: string; code?: string };
  }
  throw new Error("Expected the query to fail");
}

const setOrg = (fields: string, o = org) => t.db.exec(`update public.organizations set ${fields} where id = '${o}'`);

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(`
    insert into auth.users values
      ('${ADMIN}', 'me@cwp.in'), ('${OWNER}', 'asha@saltwater.in'), ('${OPERATOR}', 'ravi@saltwater.in'),
      ('${OTHER_OWNER}', 'neel@other.in'), ('${SPARE[0]}', 's1@x.in'), ('${SPARE[1]}', 's2@x.in');
  `);
  await t.makeAdmin(ADMIN);
  org = (await asOwner<{ id: string }>("select public.create_organization('Saltwater Studios', 'saltwater') as id"))[0].id;
  otherOrg = (await t.as<{ id: string }>("authenticated", OTHER_OWNER, "select public.create_organization('Other Studio', 'other-studio') as id"))[0].id;
  await asOwner(`insert into public.organization_members (organization_id, user_id, role) values ('${org}', '${OPERATOR}', 'operator')`);
});

describe("plans", () => {
  it("are public, with the starting prices", async () => {
    const rows = await t.as<{ id: string; price_paise: number }>("anon", null, "select id, price_paise from public.plans order by sort");
    expect(rows).toEqual([
      { id: "trial", price_paise: 0 },
      { id: "starter", price_paise: 149900 },
      { id: "pro", price_paise: 399900 },
    ]);
  });

  it("can't be edited directly, even by admins", async () => {
    expect(await asAdmin("update public.plans set price_paise = 1 returning id")).toHaveLength(0);
    expect(await asOwner("update public.plans set price_paise = 1 returning id")).toHaveLength(0);
  });

  it("are edited by admins through an audited function", async () => {
    await asAdmin("select public.admin_update_plan('starter', 'Starter', 159900, 4, 1500, 3, 7, false)");
    expect((await sql<{ price_paise: number }>("select price_paise from public.plans where id = 'starter'"))[0].price_paise).toBe(159900);
    const [entry] = await asAdmin<{ action: string; details: { before: { price_paise: number }; after: { price_paise: number } } }>(
      "select action, details from public.admin_audit_entries() where action = 'plan.updated'",
    );
    expect(entry.details.before.price_paise).toBe(149900);
    expect(entry.details.after.price_paise).toBe(159900);
    await asAdmin("select public.admin_update_plan('starter', 'Starter', 149900, 4, 1500, 3, 7, false)");
  });

  it("keep the trial free and admin-only", async () => {
    expect((await failure(asAdmin("select public.admin_update_plan('trial', 'Trial', 100, 1, 300, 2, 7, false)"))).message).toMatch(/free/);
    expect((await failure(asOwner("select public.admin_update_plan('pro', 'Pro', 1, 99, 99999, 99, 99, true)"))).message).toMatch(/admins only/i);
  });

  it("start every new studio on the trial", async () => {
    expect((await sql<{ plan_id: string }>(`select plan_id from public.organizations where id = '${org}'`))[0].plan_id).toBe("trial");
  });

  it("can't be switched by the studio itself", async () => {
    expect((await failure(asOwner(`update public.organizations set plan_id = 'pro' where id = '${org}'`))).message).toMatch(/only platform admins/i);
    expect((await failure(asOwner(`update public.organizations set paid_until = now() + interval '1 year' where id = '${org}'`))).message).toMatch(/only platform admins/i);
  });
});

describe("access", () => {
  const cases: [string, string, string | null, string | null, string][] = [
    ["trial running", "trialing", "now() + interval '3 days'", null, "ok"],
    ["trial over", "trialing", "now() - interval '1 minute'", null, "trial_ended"],
    ["paid", "active", "now()", "now() + interval '10 days'", "ok"],
    ["complimentary", "active", "now()", null, "ok"],
    ["2 days late", "active", "now()", "now() - interval '2 days'", "payment_due"],
    ["8 days late", "active", "now()", "now() - interval '8 days'", "payment_overdue"],
    ["flagged by admin", "past_due", "now()", "now() + interval '3 days'", "payment_due"],
    ["flagged, never paid", "past_due", "now()", null, "payment_overdue"],
    ["suspended", "suspended", "now() + interval '3 days'", null, "suspended"],
  ];
  it.each(cases)("%s -> %s", async (_label, status, trialEnds, paidUntil, expected) => {
    const [{ a }] = await sql<{ a: string }>(
      `select public.access_for('${status}', ${trialEnds}, ${paidUntil ?? "null"}) as a`,
    );
    expect(a).toBe(expected);
  });

  it("is visible to the studio's own members only", async () => {
    expect((await asOwner<{ a: string }>(`select public.studio_access('${org}') as a`))[0].a).toBe("ok");
    expect((await t.as<{ a: string | null }>("authenticated", OTHER_OWNER, `select public.studio_access('${org}') as a`))[0].a).toBeNull();
  });
});

describe("event limits", () => {
  it("allow the trial's one event a month", async () => {
    expect(await asOwner(eventSql(org, "december-one"))).toHaveLength(1);
  });

  it("refuse a second event in the same month, with a plain message", async () => {
    const err = await failure(asOwner(eventSql(org, "december-two", "2026-12-20 09:00+05:30", "2026-12-20 17:00+05:30")));
    expect(err.hint).toBe("plan_limit");
    expect(err.message).toBe("You've used 1 of 1 events for December 2026 on the Trial plan. Upgrade to Starter for 4.");
  });

  it("count months in India time", async () => {
    // 31 Dec 23:30 IST is still December in India, though it's 18:00 UTC.
    const err = await failure(asOwner(eventSql(org, "nye", "2026-12-31 23:30+05:30", "2027-01-01 02:00+05:30")));
    expect(err.message).toMatch(/December 2026/);
    // 1 Jan 00:30 IST is January, though it's still 31 Dec in UTC.
    expect(await asOwner(eventSql(org, "new-year", "2027-01-01 00:30+05:30", "2027-01-01 05:00+05:30"))).toHaveLength(1);
  });

  it("refuse moving an event into a full month", async () => {
    const err = await failure(asOwner(`update public.events set starts_at = '2026-12-05 09:00+05:30', ends_at = '2026-12-05 17:00+05:30' where slug = 'new-year'`));
    expect(err.hint).toBe("plan_limit");
  });

  it("cap gallery length at the plan's days", async () => {
    const err = await failure(asOwner(eventSql(org, "long-gallery", "2027-02-10 09:00+05:30", "2027-02-10 17:00+05:30", 10)));
    expect(err.message).toBe("The Trial plan keeps galleries for up to 7 days. Upgrade to Pro for 30.");
  });

  it("don't apply to platform admins", async () => {
    expect(await asAdmin(eventSql(org, "admin-made", "2026-12-25 09:00+05:30", "2026-12-25 17:00+05:30"))).toHaveLength(1);
  });
});

describe("photo and seat limits", () => {
  let eventId: string;
  let guestId: string;

  beforeAll(async () => {
    eventId = (await sql<{ id: string }>("select id from public.events where slug = 'december-one'"))[0].id;
    guestId = (
      await t.as<{ id: string }>(
        "authenticated",
        OPERATOR,
        `insert into public.guests (event_id, code, phone_e164, consent_at) values ('${eventId}', 'A17', '+919812345678', now()) returning id`,
      )
    )[0].id;
    await asAdmin("select public.admin_update_plan('trial', 'Trial', 0, 1, 2, 2, 7, false)");
  });

  it("stop photos at the plan's limit", async () => {
    const photo = (n: number) =>
      `insert into public.photos (event_id, guest_id, storage_path) values ('${eventId}', '${guestId}', '${org}/${eventId}/${n}.jpg')`;
    await t.as("authenticated", OPERATOR, photo(1));
    await t.as("authenticated", OPERATOR, photo(2));
    const err = await failure(t.as("authenticated", OPERATOR, photo(3)));
    expect(err.hint).toBe("plan_limit");
    expect(err.message).toBe("This event has reached 2 photos, the most the Trial plan allows. Upgrade to Starter for 1,500.");
  });

  it("free a photo slot when one is hidden", async () => {
    await t.as("authenticated", OPERATOR, `update public.photos set deleted_at = now() where storage_path = '${org}/${eventId}/1.jpg'`);
    const rows = await t.as("authenticated", OPERATOR, `insert into public.photos (event_id, guest_id, storage_path) values ('${eventId}', '${guestId}', '${org}/${eventId}/3.jpg') returning id`);
    expect(rows).toHaveLength(1);
    await asAdmin("select public.admin_update_plan('trial', 'Trial', 0, 1, 300, 2, 7, false)");
  });

  it("stop members at the plan's seats", async () => {
    const err = await failure(asOwner(`insert into public.organization_members (organization_id, user_id, role) values ('${org}', '${SPARE[0]}', 'operator')`));
    expect(err.message).toBe("The Trial plan has 2 team seats, and they're all taken. Upgrade to Starter for 3.");
  });
});

describe("trial end and late payment", () => {
  let liveEvent: string;
  let endedEvent: string;

  beforeAll(async () => {
    // Created as the server would (no plan checks), then set live.
    const relative = (slug: string, starts: string, ends: string) =>
      `insert into public.events (organization_id, slug, couple_names, starts_at, ends_at, orders_open_at, orders_close_at, gallery_expires_at, print_price_paise)
       values ('${org}', '${slug}', 'Live Couple', ${starts}, ${ends}, ${starts}, ${ends}, ${ends} + interval '7 days', 4900) returning id`;
    liveEvent = (await sql<{ id: string }>(relative("live-now", "now() - interval '1 hour'", "now() + interval '4 hours'")))[0].id;
    endedEvent = (await sql<{ id: string }>(relative("ended-live", "now() - interval '3 days'", "now() - interval '2 days'")))[0].id;
    await t.db.exec(`update public.events set status = 'live' where id in ('${liveEvent}', '${endedEvent}')`);
    await setOrg("trial_ends_at = now() - interval '1 minute'");
  });

  it("stop new events and going live once the trial ends", async () => {
    const err = await failure(asOwner(eventSql(org, "after-trial", "2027-03-10 09:00+05:30", "2027-03-10 17:00+05:30")));
    expect(err.hint).toBe("studio_access");
    expect(err.message).toBe("Your trial has ended. Choose a plan to start new events.");
    const live = await failure(asOwner(`update public.events set status = 'live' where slug = 'new-year'`));
    expect(live.hint).toBe("studio_access");
  });

  it("let a wedding that's already live finish", async () => {
    const rows = await t.as(
      "authenticated",
      OPERATOR,
      `insert into public.guests (event_id, code, phone_e164, consent_at) values ('${liveEvent}', 'B22', '+919800000001', now()) returning id`,
    );
    expect(rows).toHaveLength(1);
    const upload = await t.as("authenticated", OPERATOR, `insert into storage.objects (bucket_id, name) values ('event-photos', '${org}/${liveEvent}/a.jpg') returning id`);
    expect(upload).toHaveLength(1);
  });

  it("stop capture 12 hours after an event ends", async () => {
    const err = await failure(
      t.as("authenticated", OPERATOR, `insert into public.guests (event_id, code, phone_e164, consent_at) values ('${endedEvent}', 'C33', '+919800000002', now())`),
    );
    expect(err.message).toMatch(/trial has ended/);
  });

  it("allow a 7-day grace period for late payment", async () => {
    await setOrg("status = 'active', plan_id = 'starter', paid_until = now() - interval '2 days'");
    expect((await asOwner<{ a: string }>(`select public.studio_access('${org}') as a`))[0].a).toBe("payment_due");
    expect(await asOwner(eventSql(org, "during-grace", "2027-03-10 09:00+05:30", "2027-03-10 17:00+05:30"))).toHaveLength(1);
  });

  it("stop new work after the grace period", async () => {
    await setOrg("paid_until = now() - interval '8 days'");
    const err = await failure(asOwner(eventSql(org, "overdue", "2027-04-10 09:00+05:30", "2027-04-10 17:00+05:30")));
    expect(err.message).toBe("Your payment is overdue. Settle it to start new events.");
  });
});

describe("payments", () => {
  it("move the studio onto the plan, paid from today when lapsed", async () => {
    await asAdmin(`select public.admin_record_payment('${org}', 'pro', 399900, 'upi', 'UPI-123', 1)`);
    const [o] = await sql<{ status: string; plan_id: string; days: number }>(
      `select status, plan_id, round(extract(epoch from paid_until - now()) / 86400)::int as days from public.organizations where id = '${org}'`,
    );
    expect(o.status).toBe("active");
    expect(o.plan_id).toBe("pro");
    expect(o.days).toBeGreaterThanOrEqual(28);
    expect(o.days).toBeLessThanOrEqual(31);
  });

  it("extend from the current end date when paid early", async () => {
    const [{ until }] = await sql<{ until: string }>(`select paid_until as until from public.organizations where id = '${org}'`);
    await asAdmin(`select public.admin_record_payment('${org}', 'pro', 399900, 'bank_transfer', 'NEFT-9', 1)`);
    const [p] = await sql<{ period_start: string }>(`select period_start from public.payments where reference = 'NEFT-9'`);
    expect(new Date(p.period_start).toISOString()).toBe(new Date(until).toISOString());
  });

  it("refuse the same reference twice, the trial plan, and bad amounts", async () => {
    expect((await failure(asAdmin(`select public.admin_record_payment('${org}', 'pro', 399900, 'upi', 'UPI-123', 1)`))).message).toMatch(/already recorded/);
    expect((await failure(asAdmin(`select public.admin_record_payment('${org}', 'trial', 100, 'cash', null, 1)`))).message).toMatch(/paid plan/);
    expect((await failure(asAdmin(`select public.admin_record_payment('${org}', 'pro', 0, 'cash', null, 1)`))).message).toMatch(/amount/);
    expect((await failure(asAdmin(`select public.admin_record_payment('${org}', 'pro', 100, 'cash', null, 25)`))).message).toMatch(/1 to 24/);
  });

  it("are audited", async () => {
    const [entry] = await asAdmin<{ action: string; details: Record<string, unknown> }>(
      `select action, details from public.admin_audit_entries('${org}') where action = 'studio.payment_recorded'`,
    );
    expect(entry.details).toMatchObject({ plan: "pro", amount_paise: 399900, method: "bank_transfer", reference: "NEFT-9", months: 1 });
  });

  it("are visible to the studio's owner, not its operators or other studios", async () => {
    expect(await t.count(OWNER, "public.payments")).toBe(2);
    expect(await t.count(OPERATOR, "public.payments")).toBe(0);
    expect(await t.count(OTHER_OWNER, "public.payments")).toBe(0);
  });

  it("can't be written or changed through the API", async () => {
    await expect(asOwner(`insert into public.payments (organization_id, plan_id, amount_paise, method, months, period_start, period_end) values ('${org}', 'pro', 1, 'cash', 1, now(), now() + interval '1 year')`)).rejects.toThrow();
    expect(await asAdmin("update public.payments set amount_paise = 1 returning id")).toHaveLength(0);
    expect(await asAdmin("delete from public.payments returning id")).toHaveLength(0);
  });

  it("keep a studio with payments from being deleted by accident", async () => {
    await expect(t.db.exec(`delete from public.organizations where id = '${org}'`)).rejects.toThrow();
  });
});

describe("upgrade requests", () => {
  it("are made by owners for paid plans only", async () => {
    await t.as("authenticated", OTHER_OWNER, `select public.request_plan('${otherOrg}', 'starter', 'Wedding season')`);
    expect((await failure(t.as("authenticated", OTHER_OWNER, `select public.request_plan('${otherOrg}', 'trial')`))).message).toMatch(/paid plan/);
    expect((await failure(t.as("authenticated", OPERATOR, `select public.request_plan('${org}', 'pro')`))).message).toMatch(/owners and admins/);
    expect((await failure(asOwner(`select public.request_plan('${otherOrg}', 'pro')`))).message).toMatch(/owners and admins/);
  });

  it("keep one open request per studio", async () => {
    await t.as("authenticated", OTHER_OWNER, `select public.request_plan('${otherOrg}', 'pro', 'Actually Pro')`);
    const rows = await asAdmin<{ plan_id: string; note: string; requested_by_email: string; current_plan: string }>(
      "select plan_id, note, requested_by_email, current_plan from public.admin_plan_requests()",
    );
    expect(rows).toEqual([{ plan_id: "pro", note: "Actually Pro", requested_by_email: "neel@other.in", current_plan: "Trial" }]);
  });

  it("close when a payment is recorded", async () => {
    await asAdmin(`select public.admin_record_payment('${otherOrg}', 'pro', 399900, 'cash', null, 1)`);
    expect(await asAdmin("select * from public.admin_plan_requests()")).toHaveLength(0);
  });

  it("can be dismissed, once", async () => {
    const [{ id }] = await t.as<{ id: string }>("authenticated", OTHER_OWNER, `select public.request_plan('${otherOrg}', 'starter') as id`);
    await asAdmin(`select public.admin_dismiss_plan_request('${id}')`);
    expect((await failure(asAdmin(`select public.admin_dismiss_plan_request('${id}')`))).message).toMatch(/already handled/);
  });
});

describe("admin plan changes and reads", () => {
  it("moves a trial studio onto a paid plan as complimentary, and back", async () => {
    const third = (await t.as<{ id: string }>("authenticated", SPARE[1], "select public.create_organization('Third', 'third-studio') as id"))[0].id;
    await asAdmin(`select public.admin_set_plan('${third}', 'starter')`);
    expect((await sql<{ status: string; paid_until: string | null }>(`select status, paid_until from public.organizations where id = '${third}'`))[0]).toEqual({
      status: "active",
      paid_until: null,
    });
    await asAdmin(`select public.admin_set_plan('${third}', 'trial')`);
    expect((await sql<{ status: string }>(`select status from public.organizations where id = '${third}'`))[0].status).toBe("trialing");
  });

  it("shows plan, access and payments to admins", async () => {
    const [s] = await asAdmin<{ plan_name: string; access: string }>(`select plan_name, access from public.admin_studios(p_org => '${org}')`);
    expect(s).toEqual({ plan_name: "Pro", access: "ok" });
    expect(await asAdmin(`select * from public.admin_payments('${org}')`)).toHaveLength(2);
  });

  it("totals revenue on the overview", async () => {
    const [{ o }] = await asAdmin<{ o: { revenue: { mrr_paise: number; received_30d_paise: number }; open_requests: number } }>(
      "select public.admin_overview() as o",
    );
    expect(o.revenue.mrr_paise).toBe(799800);
    expect(o.revenue.received_30d_paise).toBe(399900 * 3);
    expect(o.open_requests).toBe(0);
  });
});
