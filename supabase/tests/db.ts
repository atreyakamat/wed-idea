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
-- Like Supabase: new functions in public are executable by anon and
-- authenticated unless a migration revokes it.
alter default privileges in schema public grant execute on functions to anon, authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null default 'verified');
create table auth.sessions (id uuid primary key, user_id uuid not null, factor_id uuid);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as
  $$ select auth.jwt() ->> 'role' $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated;
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
    // Each test user has one session, whose id is their user id.
    const claims = uid ? JSON.stringify({ sub: uid, role, aal, session_id: uid }) : "";
    await db.query(
      `select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
      [uid ?? "", claims],
    );
    await db.exec(`set role ${role};`);
    try {
      return (await db.query<T>(sql)).rows;
    } finally {
      // Back to the test runner's own identity, like a server-side query.
      await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false);");
    }
  }

  const count = async (uid: string | null, table: string, role: Role = "authenticated", aal: Aal = "aal1") =>
    (await as<{ n: number }>(role, uid, `select count(*)::int as n from ${table}`, aal))[0].n;

  /** A platform admin with a verified authenticator, as the setup flow leaves them. */
  async function makeAdmin(uid: string) {
    const factor = (await db.query<{ id: string }>(`insert into auth.mfa_factors (user_id) values ($1) returning id`, [uid])).rows[0].id;
    await db.query(`insert into public.admin_users (user_id, mfa_factor_id, mfa_setup_until) values ($1, $2, null)`, [uid, factor]);
    // Their session passed two-step sign-in with that authenticator.
    await db.query(`insert into auth.sessions (id, user_id, factor_id) values ($1, $1, $2)`, [uid, factor]);
    return factor;
  }

  return { db, as, count, makeAdmin };
}
