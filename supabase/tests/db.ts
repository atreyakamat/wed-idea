// Shared test database: every migration applied to an in-memory Postgres
// (PGlite), with minimal stand-ins for Supabase's auth and storage schemas.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

// auth.jwt() mirrors Supabase: the request's JWT claims as jsonb. Tests set
// "sub" (the user) and "aal" (aal1 = password only, aal2 = with MFA).
const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
`;

export type Role = "anon" | "authenticated";
export type Aal = "aal1" | "aal2";

export async function openTestDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  // Supabase grants table privileges to these roles; RLS then filters rows.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);

  /** Runs SQL as a user, like a PostgREST request with that user's JWT. */
  async function as<T>(role: Role, uid: string | null, sql: string, aal: Aal = "aal1") {
    const claims = uid ? JSON.stringify({ sub: uid, role, aal }) : "";
    await db.query(
      `select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
      [uid ?? "", claims],
    );
    await db.exec(`set role ${role};`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      await db.exec("reset role;");
    }
  }

  const count = async (uid: string | null, table: string, role: Role = "authenticated", aal: Aal = "aal1") =>
    (await as<{ n: number }>(role, uid, `select count(*)::int as n from ${table}`, aal))[0].n;

  return { db, as, count };
}
