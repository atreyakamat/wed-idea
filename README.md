# Cute Wedding Polaroid (working name)

Event photo and polaroid-print service for weddings.

Guests are photographed at a backdrop, get a private gallery link on WhatsApp, and order polaroid prints while the event's order window is open. Prints are couriered anywhere in India within 1–2 days. The couple receives one statement at the end covering all prints and courier charges.

## How it works

1. **Admin** creates an event: couple, dates, order window, price per print, optional limits.
2. **At the event**, each guest messages the event's WhatsApp number and gets a short code like `A17`. The operator enters that code before shooting, so photos are tagged to the right guest.
3. **The guest** gets a private link to their photos (kept for 7 days) and can order prints until the order window closes.
4. **After the event**, prints are made in batches, couriered, and the couple gets one statement for prints plus courier.

## Stack

- Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4, Motion
- Supabase: Postgres, Auth (admin sign-in), Storage (private photo bucket)
- Netlify for hosting
- Vitest for tests, with the database schema tested against an in-memory Postgres (PGlite)

## Project layout

```
src/
  app/                 pages (home, /admin, /admin/login)
  lib/
    auth.ts            requireAdmin(): checks session + admin role on every call
    domain/            pure business rules (guest codes, money, phone, billing, order window)
    supabase/          server, admin (service role) and proxy-session clients
  proxy.ts             refreshes the session and guards /admin routes
supabase/
  migrations/          SQL schema, row-level security, storage bucket
  tests/               schema tests run in CI
```

## Security model

- Guests never query the database directly. Their pages run on the server, check the guest's secret link token, then read data with the service-role key.
- Signed-in users only see data if they are listed in `admin_users`. There is no in-app way to become an admin.
- Photos live in a private bucket and are served through short-lived signed links.
- Money is stored as whole paise; phone numbers in E.164 (`+919812345678`).

## Local setup

1. Install Node 22 or newer, then:

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. Create a Supabase project (the free tier is enough) and fill in `.env.local` from **Project settings → API Keys**.

3. Apply the schema: either run `supabase/migrations/20261025000000_init.sql` in the Supabase SQL editor, or with the Supabase CLI:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

4. Create your admin account: in Supabase **Authentication → Users**, add a user with an email and password. Then in the SQL editor:

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

5. Run the app:

   ```bash
   npm run dev
   ```

   Sign in at http://localhost:3000/admin/login.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then run TypeScript |
| `npm test` | Unit tests and database schema tests |

## Deploying to Netlify

Connect the repo in Netlify, then add the four variables from `.env.example` under **Site configuration → Environment variables**. `netlify.toml` sets the build command and Node version.

## Workflow

Work happens on feature branches with draft pull requests; `main` only changes through reviewed merges.
