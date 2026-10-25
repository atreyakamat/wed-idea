// Applies every migration to an in-memory Postgres (PGlite) with minimal
// stand-ins for Supabase's auth and storage schemas, then checks the rules
// the app depends on: constraints, admin-only access and bill totals.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;

const ADMIN = "11111111-1111-1111-1111-111111111111";
const STRANGER = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let eventId: string;
let guestId: string;
let photoIds: string[];

async function asRole<T>(role: "anon" | "authenticated", uid: string | null, sql: string) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  // Supabase grants table privileges to these roles; RLS then filters rows.
  await db.exec("grant select, insert, update, delete on all tables in schema public to anon, authenticated;");

  await db.exec(`
    insert into auth.users values ('${ADMIN}'), ('${STRANGER}');
    insert into public.admin_users values ('${ADMIN}');
    insert into public.events (slug, couple_names, starts_at, ends_at, orders_open_at, orders_close_at, gallery_expires_at, print_price_paise)
    values ('priya-rahul', 'Priya & Rahul', '2026-12-12 09:00+05:30', '2026-12-12 17:00+05:30',
            '2026-12-12 09:00+05:30', '2026-12-12 17:00+05:30', '2026-12-19 17:00+05:30', 4900);
  `);
  eventId = (await db.query<{ id: string }>("select id from public.events")).rows[0].id;
  await db.exec(`insert into public.guests (event_id, code, phone_e164, consent_at) values ('${eventId}', 'A17', '+919812345678', now());`);
  guestId = (await db.query<{ id: string }>("select id from public.guests")).rows[0].id;
  await db.exec(`insert into public.photos (event_id, guest_id, storage_path) values
    ('${eventId}', '${guestId}', 'priya-rahul/a.jpg'), ('${eventId}', '${guestId}', 'priya-rahul/b.jpg');`);
  photoIds = (await db.query<{ id: string }>("select id from public.photos order by storage_path")).rows.map((r) => r.id);
});

describe("guests", () => {
  it("gets a long random access token by default", async () => {
    const { rows } = await db.query<{ len: number }>("select length(access_token)::int as len from public.guests");
    expect(rows[0].len).toBe(48);
  });

  it.each([
    ["letter I in code", "I17", "+919800000000"],
    ["duplicate code in the same event", "A17", "+919800000001"],
    ["phone not in E.164", "B22", "9812345678"],
  ])("rejects %s", async (_label, code, phone) => {
    await expect(
      db.exec(`insert into public.guests (event_id, code, phone_e164, consent_at) values ('${eventId}', '${code}', '${phone}', now())`),
    ).rejects.toThrow();
  });
});

describe("events", () => {
  it("rejects an invalid slug", async () => {
    await expect(
      db.exec(`insert into public.events (slug, couple_names, starts_at, ends_at, gallery_expires_at)
               values ('Bad Slug', 'x', now(), now() + interval '1 hour', now() + interval '2 hours')`),
    ).rejects.toThrow();
  });

  it("rejects an event that ends before it starts", async () => {
    await expect(
      db.exec(`insert into public.events (slug, couple_names, starts_at, ends_at, gallery_expires_at)
               values ('time-bad', 'x', now(), now() - interval '1 hour', now())`),
    ).rejects.toThrow();
  });
});

describe("couple's statement", () => {
  it("totals prints and courier and ignores cancelled orders", async () => {
    await db.exec(`insert into public.orders (event_id, guest_id, recipient_name, phone_e164, address_line1, city, state, pincode, courier_charge_paise)
      values ('${eventId}', '${guestId}', 'Asha', '+919812345678', '12 MG Road', 'Pune', 'Maharashtra', '411001', 6500),
             ('${eventId}', '${guestId}', 'Ravi', '+919812345678', '4 Park St', 'Kolkata', 'West Bengal', '700016', 8000);`);
    const orders = (await db.query<{ id: string }>("select id from public.orders order by recipient_name")).rows;
    await db.exec(`insert into public.order_items (order_id, photo_id, copies, unit_price_paise) values
      ('${orders[0].id}', '${photoIds[0]}', 3, 4900),
      ('${orders[0].id}', '${photoIds[1]}', 1, 4900),
      ('${orders[1].id}', '${photoIds[0]}', 2, 4900);
      update public.orders set status = 'cancelled' where recipient_name = 'Ravi';`);

    const { rows } = await db.query<Record<string, number>>(
      "select order_count, copies, prints_paise, courier_paise, total_paise from public.event_statements",
    );
    expect(rows[0]).toEqual({
      order_count: 1,
      copies: 4,
      prints_paise: 19600,
      courier_paise: 6500,
      total_paise: 26100,
    });
  });

  it("rejects a pincode starting with 0 and zero copies", async () => {
    await expect(db.exec("update public.orders set pincode = '012345'")).rejects.toThrow();
    const order = (await db.query<{ id: string }>("select id from public.orders limit 1")).rows[0];
    await expect(
      db.exec(`insert into public.order_items (order_id, photo_id, copies, unit_price_paise) values ('${order.id}', '${photoIds[1]}', 0, 4900)`),
    ).rejects.toThrow();
  });
});

describe("row-level security", () => {
  it("lets admins see guests", async () => {
    const rows = await asRole<{ n: number }>("authenticated", ADMIN, "select count(*)::int as n from public.guests");
    expect(rows[0].n).toBe(1);
  });

  it("hides everything from signed-in non-admins", async () => {
    for (const table of ["events", "guests", "photos", "orders", "order_items", "event_statements"]) {
      const rows = await asRole<{ n: number }>("authenticated", STRANGER, `select count(*)::int as n from public.${table}`);
      expect(rows[0].n, table).toBe(0);
    }
  });

  it("hides everything from anonymous visitors", async () => {
    const rows = await asRole<{ n: number }>("anon", null, "select count(*)::int as n from public.guests");
    expect(rows[0].n).toBe(0);
  });

  it("blocks non-admin writes", async () => {
    await expect(
      asRole("authenticated", STRANGER, `insert into public.events (slug, couple_names, starts_at, ends_at, gallery_expires_at)
        values ('sneaky', 'x', now(), now() + interval '1 hour', now() + interval '2 hours')`),
    ).rejects.toThrow();
  });
});
