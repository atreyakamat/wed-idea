import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Building consolidated migration SQL from ${files.length} files...`);

let rawCombined = "";
for (const file of files) {
  const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  rawCombined += `\n-- ============================================================================\n`;
  rawCombined += `-- Migration: ${file}\n`;
  rawCombined += `-- ============================================================================\n\n`;
  rawCombined += content.trim() + "\n";
}

function makeIdempotent(sql) {
  let res = sql;

  // 1. Enums: wrap in do $$ begin ... exception when duplicate_object then null; end $$;
  res = res.replace(
    /create type\s+([a-zA-Z0-9_.]+)\s+as enum\s*\(([^;]+)\);/g,
    (match, name, vals) => {
      return `do $$ begin\n  create type ${name} as enum (${vals});\nexception\n  when duplicate_object then null;\nend $$;`;
    }
  );

  // 2. Tables: create table if not exists
  res = res.replace(
    /create table\s+(?!if not exists)([a-zA-Z0-9_.]+)\s*\(/g,
    "create table if not exists $1 ("
  );

  // 3. Views: create or replace view
  res = res.replace(/create view\s+/g, "create or replace view ");

  // 4. Indexes: create index if not exists
  res = res.replace(
    /create\s+(unique\s+)?index\s+(?!if not exists)([a-zA-Z0-9_]+)/g,
    (match, uniq, idx) => {
      return `create ${uniq || ""}index if not exists ${idx}`;
    }
  );

  // 5. Columns: add column if not exists
  res = res.replace(
    /add column\s+(?!if not exists)([a-zA-Z0-9_]+)/g,
    "add column if not exists $1"
  );

  // 6. Constraints: drop constraint if exists before adding
  res = res.replace(
    /(alter table\s+([a-zA-Z0-9_.]+)[^;]*?add constraint\s+organizations_suspension_consistent)/g,
    (match, full, tbl) => {
      return `alter table ${tbl} drop constraint if exists organizations_suspension_consistent;\n${full}`;
    }
  );
  res = res.replace(
    /(alter table\s+([a-zA-Z0-9_.]+)[^;]*?add constraint\s+project_photos_edit_pair)/g,
    (match, full, tbl) => {
      return `alter table ${tbl} drop constraint if exists project_photos_edit_pair, drop constraint if exists project_photos_look_needs_edit;\n${full}`;
    }
  );

  // 7. Functions: drop function if exists admin_studios before re-defining (since return type OUT parameters change)
  res = res.replace(
    /(create or replace function\s+([a-zA-Z0-9_.]+)\.admin_studios\s*\()/g,
    (match, full, schema) => {
      return `drop function if exists ${schema}.admin_studios(text, ${schema}.studio_status, uuid);\n${full}`;
    }
  );

  // 8. Triggers: drop trigger if exists before create trigger
  res = res.replace(
    /create trigger\s+([a-zA-Z0-9_]+)\s+([\s\S]*?)\s+on\s+([a-zA-Z0-9_.]+)/g,
    (match, trg, timing, tbl) => {
      return `drop trigger if exists ${trg} on ${tbl};\ncreate trigger ${trg} ${timing} on ${tbl}`;
    }
  );

  // 9. Policies: drop policy if exists before create policy, and convert all drop policy to drop policy if exists
  res = res.replace(
    /drop policy\s+(?!if exists)\"([^\"]+)\"\s+on\s+([a-zA-Z0-9_.]+);/g,
    'drop policy if exists "$1" on $2;'
  );
  res = res.replace(
    /create policy\s+\"([^\"]+)\"\s+on\s+([a-zA-Z0-9_.]+)/g,
    (match, pol, tbl) => {
      return `drop policy if exists "${pol}" on ${tbl};\ncreate policy "${pol}" on ${tbl}`;
    }
  );

  // 10. Plans seed: on conflict (id) do nothing
  res = res.replace(
    /insert into ([a-zA-Z0-9_.]+\.plans) \([^)]+\) values\s+([^;]+);/s,
    (match) => match.replace(/;\s*$/, " on conflict (id) do nothing;")
  );

  return res;
}

// 1. PUBLIC SCHEMA MIGRATION
const publicHeader = `-- ============================================================================
-- CUTE WEDDING POLAROID - SUPABASE DATABASE MIGRATION (PUBLIC SCHEMA)
-- ============================================================================
-- Run this script in the Supabase Dashboard -> SQL Editor -> New Query -> Run.
--
-- This script installs all tables, functions, triggers, RLS policies, and storage
-- buckets for the Cute Wedding Polaroid application into the default 'public' schema.
-- Fully idempotent (safe to re-run multiple times).
-- ============================================================================

`;

const publicSql = publicHeader + makeIdempotent(rawCombined);
fs.writeFileSync(path.join(ROOT, "supabase-migration-public.sql"), publicSql);
fs.writeFileSync(path.join(ROOT, "supabase-migration-public.txt"), publicSql);
console.log("Wrote supabase-migration-public.sql and .txt");

// 2. ISOLATED SCHEMA MIGRATION (wed_idea)
const isolatedHeader = `-- ============================================================================
-- CUTE WEDDING POLAROID - SUPABASE DATABASE MIGRATION (ISOLATED SCHEMA: wed_idea)
-- ============================================================================
-- USE THIS SCRIPT IF SHARING A SUPABASE PROJECT WITH ANOTHER APPLICATION.
--
-- How it works:
-- 1. Creates a dedicated 'wed_idea' schema so none of your existing tables,
--    functions, or triggers in 'public' are touched or mixed with this app.
-- 2. Grants full access on the 'wed_idea' schema to Supabase's API roles
--    ('anon', 'authenticated', 'service_role').
-- 3. Creates all tables, enums, functions, and RLS policies inside 'wed_idea'.
-- 4. Creates the required storage buckets ('event-photos', 'project-photos', 'studio-logos').
-- Fully idempotent (safe to re-run multiple times).
--
-- INSTRUCTIONS:
-- 1. In Supabase Dashboard -> SQL Editor, paste and run this entire file.
-- 2. In Supabase Dashboard -> Project Settings -> API:
--    Under "Exposed schemas", add 'wed_idea' (e.g. public, wed_idea).
-- 3. In your .env.local file:
--    Set NEXT_PUBLIC_SUPABASE_SCHEMA=wed_idea
-- ============================================================================

create schema if not exists wed_idea;

-- Allow Supabase API roles to access this schema
grant usage on schema wed_idea to anon, authenticated, service_role;
grant all on all tables in schema wed_idea to anon, authenticated, service_role;
grant all on all routines in schema wed_idea to anon, authenticated, service_role;
grant all on all sequences in schema wed_idea to anon, authenticated, service_role;

alter default privileges in schema wed_idea grant all on tables to anon, authenticated, service_role;
alter default privileges in schema wed_idea grant all on routines to anon, authenticated, service_role;
alter default privileges in schema wed_idea grant all on sequences to anon, authenticated, service_role;

`;

let isolatedSql = makeIdempotent(rawCombined).replace(/public\./g, "wed_idea.");

const fullIsolatedSql = isolatedHeader + isolatedSql;
fs.writeFileSync(path.join(ROOT, "supabase-migration-isolated.sql"), fullIsolatedSql);
fs.writeFileSync(path.join(ROOT, "supabase-migration-isolated.txt"), fullIsolatedSql);
console.log("Wrote supabase-migration-isolated.sql and .txt");
