// Razorpay orders: applied once, from the browser or the webhook, never by users directly.
import { beforeAll, describe, expect, it } from "vitest";
import { openTestDb } from "./db";

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000001";

let t: Awaited<ReturnType<typeof openTestDb>>;
let org: string;

const sql = async <T>(q: string) => (await t.db.query<T>(q)).rows;

async function failure(p: Promise<unknown>): Promise<{ message: string }> {
  try {
    await p;
  } catch (e) {
    return e as { message: string };
  }
  throw new Error("Expected the query to fail");
}

async function order(id: string, plan = "starter", months = 1, amount = 99900) {
  await t.db.exec(`insert into public.razorpay_orders (organization_id, plan_id, months, amount_paise, order_id, created_by) values ('${org}', '${plan}', ${months}, ${amount}, '${id}', '${OWNER}')`);
}

const apply = (orderId: string, payment: string, amount: number) => sql<{ until: string }>(`select public.apply_razorpay_payment('${orderId}', '${payment}', ${amount}) as until`);

beforeAll(async () => {
  t = await openTestDb();
  await t.db.exec(`insert into auth.users values ('${OWNER}', 'a@a.in'), ('${OTHER}', 'b@b.in')`);
  org = (await t.as<{ id: string }>("authenticated", OWNER, "select public.create_organization('Saltwater', 'saltwater') as id"))[0].id;
  await t.as("authenticated", OTHER, "select public.create_organization('Other', 'other-studio')");
});

describe("applying a Razorpay payment", () => {
  it("moves the studio to the plan, active and paid for the months bought", async () => {
    await order("order_AAAAAAAA1", "starter", 3, 3 * 99900);
    await apply("order_AAAAAAAA1", "pay_BBBBBBBB1", 3 * 99900);
    const [o] = await sql<{ plan_id: string; status: string; months: number }>(
      `select plan_id, status, extract(month from age(paid_until, now()))::int + 12 * extract(year from age(paid_until, now()))::int as months from public.organizations where id = '${org}'`,
    );
    expect(o).toMatchObject({ plan_id: "starter", status: "active" });
    expect(o.months).toBeGreaterThanOrEqual(2);
    const [pay] = await sql<{ method: string; reference: string; amount_paise: number }>(`select method, reference, amount_paise from public.payments where organization_id = '${org}'`);
    expect(pay).toEqual({ method: "razorpay", reference: "pay_BBBBBBBB1", amount_paise: 299700 });
  });

  it("counts once when the browser and the webhook both report it", async () => {
    const first = await apply("order_AAAAAAAA1", "pay_BBBBBBBB1", 3 * 99900);
    const again = await apply("order_AAAAAAAA1", "pay_BBBBBBBB1", 3 * 99900);
    expect(again[0].until).toEqual(first[0].until);
    expect((await sql<{ n: number }>(`select count(*)::int as n from public.payments where organization_id = '${org}'`))[0].n).toBe(1);
    expect((await failure(apply("order_AAAAAAAA1", "pay_CCCCCCCC1", 3 * 99900))).message).toMatch(/already paid/);
  });

  it("extends from the current paid-until when renewing the same plan", async () => {
    const [before] = await sql<{ paid_until: string }>(`select paid_until from public.organizations where id = '${org}'`);
    await order("order_AAAAAAAA2");
    const [after] = await apply("order_AAAAAAAA2", "pay_BBBBBBBB2", 99900);
    const gainedDays = (new Date(after.until).getTime() - new Date(before.paid_until).getTime()) / 86_400_000;
    expect(gainedDays).toBeGreaterThanOrEqual(28);
    expect(gainedDays).toBeLessThanOrEqual(31);
  });

  it("refuses a wrong amount or an unknown order", async () => {
    await order("order_AAAAAAAA3", "pro", 1, 249900);
    expect((await failure(apply("order_AAAAAAAA3", "pay_BBBBBBBB3", 100))).message).toMatch(/doesn't match/);
    expect((await failure(apply("order_ZZZZZZZZ9", "pay_BBBBBBBB4", 100))).message).toMatch(/Unknown order/);
    expect((await sql<{ status: string }>(`select status from public.razorpay_orders where order_id = 'order_AAAAAAAA3'`))[0].status).toBe("created");
  });

  it("is server-only; managers can only read their own orders", async () => {
    expect((await failure(t.as("authenticated", OWNER, `select public.apply_razorpay_payment('order_AAAAAAAA3', 'pay_BBBBBBBB9', 249900)`))).message).toMatch(/permission denied/);
    expect((await failure(t.as("authenticated", OWNER, `insert into public.razorpay_orders (organization_id, plan_id, months, amount_paise, order_id) values ('${org}', 'pro', 1, 1, 'order_FREEFREE1')`))).message).toMatch(/row-level security|permission denied/);
    expect(await t.count(OWNER, "public.razorpay_orders")).toBe(3);
    expect(await t.count(OTHER, "public.razorpay_orders")).toBe(0);
  });
});
