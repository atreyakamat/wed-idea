# Cute Wedding Polaroid (working name)

Polaroid stations for weddings, run as a SaaS for studios: photographers, photobooth and event businesses.

Guests are photographed at a custom backdrop and get a private gallery link on WhatsApp. They can order mini polaroid prints (5.4 × 8.6 cm) while the event's order window is open. Prints are couriered anywhere in India within 1–2 days, and the couple receives one statement at the end covering all prints and courier charges.

## How it works

1. **A studio signs up** and creates its studio. Owners and admins manage events; operators run capture at the event.
2. **The studio sets up each wedding:**
   - couple, dates, order window and how long photos are kept;
   - price per print, copy and budget limits;
   - a brief for the client's custom backdrop.
3. **The couple picks a polaroid design**, choosing one of 9 styles, the names, date, colours and a photo filter, and locks it. An event can't go live until its design is locked.
4. **At the event**, photos are taken on a phone or SLR and tagged to the guest's WhatsApp number. The locked design is applied automatically, and the guest gets their private link. *(Coming next.)*
5. **After the event**, prints are made in batches on A4 sheets, couriered, and the couple gets one statement for prints plus courier.

## Stack

- Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4, Motion
- Supabase: Postgres, Auth, Storage (private photo bucket)
- Netlify for hosting
- Vitest for unit tests. The database schema is tested against an in-memory Postgres (PGlite).

## Project layout

```
src/
  app/
    (auth)/            /login, /signup, sign-in and sign-up actions
    auth/callback/     email confirmation link handler
    onboarding/        create your studio
    dashboard/         events list, new event, event page (design, prints, details, status)
    templates/         public template gallery and A4 print sheet preview
  components/
    dashboard/         event forms, design editor, status controls
    polaroid/          SVG polaroid card, decorations, print sheet, filters
    ui/                form fields and buttons
  lib/
    auth.ts            requireUser / requireStudio / requireStudioManager
    events/            event form parsing (IST), status rules, design defaults, queries
    polaroid/          templates, filters, text fitting, sheet layout, theme schema
    domain/            guest codes, money, phone, billing, order window
    supabase/          server, admin (service role) and proxy-session clients
  proxy.ts             refreshes the session and guards /dashboard and /onboarding
supabase/
  config.toml          local Supabase settings
  migrations/          schema, studios, row-level security, storage bucket
  tests/               schema and access-rule tests run in CI
```

## Security model

- **Studios are isolated by row-level security.** Members see only their own studio's events, guests, photos and orders, so another studio's event returns 404.
- **Roles:** owners and admins manage settings, design and orders; operators can read events and add guests and photos. Owners can't remove themselves, so a studio always keeps an owner.
- **Guests never query the database directly.** Their pages run on the server, check the guest's secret link token, then read data with the service-role key.
- **Photos** live in a private bucket under `<studio id>/<event id>/`, and storage rules only let members of that studio read or write there.
- **Platform admins** (`admin_users`) can see every studio for support. They are added by hand in SQL only.
- **Data formats:** money is stored as whole paise and phone numbers in E.164 (`+919812345678`). Event times are entered in India time.

## Local development

You need Node 22 or newer, and Docker for a local Supabase.

```bash
npm install
npx supabase start      # local Postgres, Auth, REST and Storage; applies migrations
npx supabase status     # prints the local URL and keys
```

Create `.env.local` from `.env.example` using the local URL and keys from `supabase status`, then:

```bash
npm run dev
```

Open http://localhost:3000/signup. Locally, sign-ups don't need email confirmation.

To reset the local database and re-run all migrations: `npx supabase db reset`.

## Hosted setup

1. Create a Supabase project. The free tier is enough to start.
2. Apply the migrations:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

3. Under **Authentication → URL Configuration**:
   - set the Site URL to your domain;
   - add `https://<your-domain>/auth/callback` as a redirect URL.
4. In Netlify, add the four variables from `.env.example` under **Site configuration → Environment variables**. `netlify.toml` sets the build command and Node version.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then run TypeScript |
| `npm test` | Unit tests plus database schema and access tests |

## Workflow

Work happens on feature branches with draft pull requests. `main` only changes through reviewed merges.
