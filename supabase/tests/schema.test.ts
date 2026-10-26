// Applies every migration to an in-memory Postgres (PGlite) with minimal
// stand-ins for Supabase's auth and storage schemas, then checks the rules
// the app depends on: constraints, studio isolation, roles and bill totals.
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

// Platform admin, two studio owners, an operator in studio A, a stranger.
const ADMIN = "11111111-1111-1111-1111-111111111111";
const OWNER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const OPERATOR_A = "aaaaaaaa-0000-0000-0000-000000000002";
const OWNER_B = "bbbbbbbb-0000-0000-0000-000000000001";
const STRANGER = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let orgA: string;
let orgB: string;
let eventA: string;
let eventB: string;
let guestA: string;
let photoIds: string[];

type Role = "anon" | "authenticated";

async function as<T>(role: Role, uid: string | null, sql: string) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

const count = async (uid: string | null, table: string, role: Role = "authenticated") =>
  (await as<{ n: number }>(role, uid, `select count(*)::int as n from ${table}`))[0].n;

function eventSql(org: string, slug: string) {
  return `insert into public.events (organization_id, slug, couple_names, starts_at, ends_at, orders_open_at, orders_close_at, gallery_expires_at, print_price_paise)
    values ('${org}', '${slug}', 'Priya & Rahul', '2026-12-12 09:00+05:30', '2026-12-12 17:00+05:30',
            '2026-12-12 09:00+05:30', '2026-12-12 17:00+05:30', '2026-12-19 17:00+05:30', 4900) returning id`;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  // Supabase grants table privileges to these roles; RLS then filters rows.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    insert into auth.users values ('${ADMIN}'), ('${OWNER_A}'), ('${OPERATOR_A}'), ('${OWNER_B}'), ('${STRANGER}');
    insert into public.admin_users values ('${ADMIN}');
  `);

  // Owners create their studios through the RPC, as the app does.
  orgA = (await as<{ id: string }>("authenticated", OWNER_A, "select public.create_organization('Saltwater Studios', 'saltwater') as id"))[0].id;
  orgB = (await as<{ id: string }>("authenticated", OWNER_B, "select public.create_organization('Other Studio', 'other-studio') as id"))[0].id;
  await as("authenticated", OWNER_A, `insert into public.organization_members (organization_id, user_id, role) values ('${orgA}', '${OPERATOR_A}', 'operator')`);

  eventA = (await as<{ id: string }>("authenticated", OWNER_A, eventSql(orgA, "priya-rahul")))[0].id;
  eventB = (await as<{ id: string }>("authenticated", OWNER_B, eventSql(orgB, "other-wedding")))[0].id;

  guestA = (
    await as<{ id: string }>(
      "authenticated",
      OPERATOR_A,
      `insert into public.guests (event_id, code, phone_e164, consent_at) values ('${eventA}', 'A17', '+919812345678', now()) returning id`,
    )
  )[0].id;
  photoIds = (
    await as<{ id: string }>(
      "authenticated",
      OPERATOR_A,
      `insert into public.photos (event_id, guest_id, storage_path) values
        ('${eventA}', '${guestA}', '${orgA}/${eventA}/a.jpg'), ('${eventA}', '${guestA}', '${orgA}/${eventA}/b.jpg')
       returning id`,
    )
  ).map((r) => r.id);
});

describe("studios", () => {
  it("makes the creator the owner", async () => {
    const rows = await as<{ role: string }>("authenticated", OWNER_A, `select role from public.organization_members where user_id = '${OWNER_A}'`);
    expect(rows).toEqual([{ role: "owner" }]);
  });

  it("refuses to create a studio when signed out", async () => {
    await expect(as("anon", null, "select public.create_organization('x', 'xyz')")).rejects.toThrow();
  });

  it("rejects an invalid or duplicate studio slug", async () => {
    await expect(as("authenticated", STRANGER, "select public.create_organization('Bad', 'Bad Slug')")).rejects.toThrow();
    await expect(as("authenticated", STRANGER, "select public.create_organization('Dup', 'saltwater')")).rejects.toThrow();
  });

  it("shows each owner only their own studio", async () => {
    const rows = await as<{ slug: string }>("authenticated", OWNER_B, "select slug from public.organizations");
    expect(rows).toEqual([{ slug: "other-studio" }]);
  });

  it("stops owners from removing themselves", async () => {
    const rows = await as(
      "authenticated",
      OWNER_A,
      `delete from public.organization_members where organization_id = '${orgA}' and user_id = '${OWNER_A}' returning user_id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("stops operators from adding members", async () => {
    await expect(
      as("authenticated", OPERATOR_A, `insert into public.organization_members (organization_id, user_id, role) values ('${orgA}', '${STRANGER}', 'owner')`),
    ).rejects.toThrow();
  });
});

describe("studio isolation", () => {
  it.each(["events", "guests", "photos", "orders", "event_statements"])("keeps studio B out of studio A's %s", async (table) => {
    const rows = await as<{ n: number }>(
      "authenticated",
      OWNER_B,
      table === "events" || table === "event_statements"
        ? `select count(*)::int as n from public.${table} where ${table === "events" ? "id" : "event_id"} = '${eventA}'`
        : `select count(*)::int as n from public.${table} where event_id = '${eventA}'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it("blocks creating an event in another studio", async () => {
    await expect(as("authenticated", OWNER_B, eventSql(orgA, "sneaky-event"))).rejects.toThrow();
  });

  it("hides everything from signed-in strangers and anonymous visitors", async () => {
    for (const table of ["public.organizations", "public.events", "public.guests", "public.photos"]) {
      expect(await count(STRANGER, table), table).toBe(0);
      expect(await count(null, table, "anon"), table).toBe(0);
    }
  });

  it("lets platform admins see every studio", async () => {
    expect(await count(ADMIN, "public.organizations")).toBe(2);
    expect(await count(ADMIN, "public.events")).toBe(2);
  });
});

describe("roles", () => {
  it("lets operators read events and capture guests and photos", async () => {
    expect(await count(OPERATOR_A, "public.events")).toBe(1);
    expect(await count(OPERATOR_A, "public.photos")).toBe(2);
  });

  it("stops operators changing event settings", async () => {
    const rows = await as(
      "authenticated",
      OPERATOR_A,
      `update public.events set print_price_paise = 1 where id = '${eventA}' returning id`,
    );
    expect(rows).toHaveLength(0);
  });

  it("lets owners update their event", async () => {
    const rows = await as(
      "authenticated",
      OWNER_A,
      `update public.events set backdrop_brief = 'Pampas grass arch, ivory drapes' where id = '${eventA}' returning id`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("storage", () => {
  it("allows uploads only under the member's own studio folder", async () => {
    await as("authenticated", OPERATOR_A, `insert into storage.objects (bucket_id, name) values ('event-photos', '${orgA}/${eventA}/c.jpg')`);
    await expect(
      as("authenticated", OPERATOR_A, `insert into storage.objects (bucket_id, name) values ('event-photos', '${orgB}/${eventB}/c.jpg')`),
    ).rejects.toThrow();
    await expect(
      as("authenticated", OPERATOR_A, `insert into storage.objects (bucket_id, name) values ('event-photos', 'not-a-uuid/c.jpg')`),
    ).rejects.toThrow();
  });

  it("hides other studios' files", async () => {
    expect(await count(OWNER_B, "storage.objects")).toBe(0);
    expect(await count(OWNER_A, "storage.objects")).toBe(1);
  });
});

describe("guests", () => {
  it("get a long random access token by default", async () => {
    const { rows } = await db.query<{ len: number }>("select length(access_token)::int as len from public.guests");
    expect(rows[0].len).toBe(48);
  });

  it.each([
    ["letter I in code", "I17", "+919800000000"],
    ["duplicate code in the same event", "A17", "+919800000001"],
    ["phone not in E.164", "B22", "9812345678"],
  ])("reject %s", async (_label, code, phone) => {
    await expect(
      db.exec(`insert into public.guests (event_id, code, phone_e164, consent_at) values ('${eventA}', '${code}', '${phone}', now())`),
    ).rejects.toThrow();
  });
});

describe("events", () => {
  it("reject an invalid slug and an end before the start", async () => {
    await expect(
      db.exec(`insert into public.events (organization_id, slug, couple_names, starts_at, ends_at, gallery_expires_at)
               values ('${orgA}', 'Bad Slug', 'x', now(), now() + interval '1 hour', now() + interval '2 hours')`),
    ).rejects.toThrow();
    await expect(
      db.exec(`insert into public.events (organization_id, slug, couple_names, starts_at, ends_at, gallery_expires_at)
               values ('${orgA}', 'time-bad', 'x', now(), now() - interval '1 hour', now())`),
    ).rejects.toThrow();
  });

  it("require a studio", async () => {
    await expect(
      db.exec(`insert into public.events (slug, couple_names, starts_at, ends_at, gallery_expires_at)
               values ('no-studio', 'x', now(), now() + interval '1 hour', now() + interval '2 hours')`),
    ).rejects.toThrow();
  });
});

describe("couple's statement", () => {
  it("totals prints and courier and ignores cancelled orders", async () => {
    await db.exec(`insert into public.orders (event_id, guest_id, recipient_name, phone_e164, address_line1, city, state, pincode, courier_charge_paise)
      values ('${eventA}', '${guestA}', 'Asha', '+919812345678', '12 MG Road', 'Pune', 'Maharashtra', '411001', 6500),
             ('${eventA}', '${guestA}', 'Ravi', '+919812345678', '4 Park St', 'Kolkata', 'West Bengal', '700016', 8000);`);
    const orders = (await db.query<{ id: string }>("select id from public.orders order by recipient_name")).rows;
    await db.exec(`insert into public.order_items (order_id, photo_id, copies, unit_price_paise) values
      ('${orders[0].id}', '${photoIds[0]}', 3, 4900),
      ('${orders[0].id}', '${photoIds[1]}', 1, 4900),
      ('${orders[1].id}', '${photoIds[0]}', 2, 4900);
      update public.orders set status = 'cancelled' where recipient_name = 'Ravi';`);

    const rows = await as<Record<string, number>>(
      "authenticated",
      OWNER_A,
      `select order_count, copies, prints_paise, courier_paise, total_paise from public.event_statements where event_id = '${eventA}'`,
    );
    expect(rows[0]).toEqual({ order_count: 1, copies: 4, prints_paise: 19600, courier_paise: 6500, total_paise: 26100 });
  });

  it("lets operators read but not change orders", async () => {
    expect(await count(OPERATOR_A, "public.orders")).toBe(2);
    const rows = await as("authenticated", OPERATOR_A, "update public.orders set courier_charge_paise = 0 returning id");
    expect(rows).toHaveLength(0);
  });

  it("rejects a pincode starting with 0 and zero copies", async () => {
    await expect(db.exec("update public.orders set pincode = '012345'")).rejects.toThrow();
    const order = (await db.query<{ id: string }>("select id from public.orders limit 1")).rows[0];
    await expect(
      db.exec(`insert into public.order_items (order_id, photo_id, copies, unit_price_paise) values ('${order.id}', '${photoIds[1]}', 0, 4900)`),
    ).rejects.toThrow();
  });
});
