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
4. **At the event**, an operator opens the capture screen (`/dashboard/events/<id>/capture`) on a phone or laptop:
   1. Enter the guest's WhatsApp number and tick consent. The guest gets a code like `A17`, and the same number later resumes the same guest.
   2. Take photos with the phone camera, or add SLR shots from the laptop. Photos are resized and stripped of location data in the browser, then uploaded straight to private storage.
   3. Tap **Send on WhatsApp**. WhatsApp opens with the guest's gallery link ready to send.
5. **The guest** opens their private link (`/g/<token>`). They see their photos in the couple's polaroid design until the gallery expires, and can save each one as a 300 dpi PNG or download the original.
6. **After the event**, prints are made in batches on A4 sheets, couriered, and the couple gets one statement for prints plus courier. *(Print ordering coming next.)*

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
    dashboard/         events list, new event, event page (design, prints, details, status), capture screen, plan & billing
    g/[token]/         a guest's private gallery
    templates/         public template gallery and A4 print sheet preview
    admin/             platform admin: two-step sign-in, overview, studios, events, plans, audit log
  components/
    admin/             stat tiles, status badge, filters, sign-up chart
    dashboard/         event forms, design editor, status controls, account banner
    polaroid/          SVG polaroid card, decorations, print sheet, filters
    ui/                form fields and buttons
  lib/
    auth.ts            requireUser / requireStudio / requireStudioManager
    admin/             requireAdmin, admin queries, formatting
    studio/            plan access rules, banners, billing data, India-time months
    capture/           photo processing, storage paths, WhatsApp message and link
    gallery/           guest gallery lookup (by secret token) and polaroid PNG export
    events/            event form parsing (IST), status rules, design defaults, queries
    polaroid/          templates, filters, text fitting, sheet layout, theme schema
    domain/            guest codes, money, phone, billing, order window
    supabase/          server, admin (service role) and proxy-session clients
  proxy.ts             refreshes the session; guards /dashboard, /onboarding and /admin
supabase/
  config.toml          local Supabase settings
  migrations/          schema, studios, row-level security, storage bucket
  tests/               schema and access-rule tests run in CI
```

## Security model

- **Studios are isolated by row-level security.** Members see only their own studio's events, guests, photos and orders, so another studio's event returns 404.
- **Roles:** owners and admins manage settings, design and orders; operators can read events and add guests and photos. Owners can't remove themselves, so a studio always keeps an owner.
- **Guests never query the database directly.** Their pages run on the server, check the guest's secret link token, then read data with the service-role key.
- **Photos** live in a private bucket under `<studio id>/<event id>/<guest id>/`. Storage rules only let members of that studio read or write there. The database also rejects a photo whose files sit outside its event's folder, or whose guest belongs to another event. Guests see their photos through signed links that last 1 hour.
- **Guest galleries** are opened by a 48-character secret token, looked up on the server.
  - Pages are marked `noindex`, and links never leak through the Referer header.
  - Malformed links get a 404 from the proxy.
  - After the gallery's expiry date the photos are hidden. Deleting the files automatically is still to do.
- **Platform admins** (`admin_users`) run the `/admin` console. See [Platform admin](#platform-admin).
- **Data formats:** money is stored as whole paise and phone numbers in E.164 (`+919812345678`). Event times are entered in India time.

## Platform admin

`/admin` is for you, the platform owner, not for studios.

- **Overview:** studios by status, trials ending this week, live events, guests, photos, storage and sign-ups per week.
- **Studios:** search by name, link or owner email; open a studio to see its team, events, usage and history.
- **Actions:** suspend (a reason is required and shown to the studio), reactivate, mark as payment due, extend a trial by 7, 14 or 30 days, record a payment or change plan.
- **Plans:** edit prices and limits (see [Plans and billing](#plans-and-billing)).
- **Events:** every studio's weddings, read-only, for support.
- **Audit log:** every admin change with who, when and why. Nobody can edit or delete entries.

**Studio status.** New studios start on a 14-day trial, one studio per account. A suspended studio can't create events, go live, capture, upload, move events to another studio or open a new studio, but its guests can still open their galleries.

**Security.**
- Admin powers need two-step sign-in. The database's `is_admin()` is true only for an `admin_users` row **and** a session whose second step (`aal2`) used that admin's registered authenticator. A stolen password alone gets nothing.
- Authenticator setup is only open for **one hour** after an admin is added or reset. Set it up straight away.
- Status and trial fields can only change through the audited admin functions, never by a direct update, even by an admin.
- Audit entries keep the studio's name and the admin's email, so deleting either never rewrites history.
- Non-admins who open `/admin` get a 404.

**Make yourself an admin.** Sign up normally, then run this in the Supabase SQL editor:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'you@example.com';
```

Within the hour, open `/admin`, scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy) and enter the code.

Adding an admin removes any authenticator already on that account, so one planted earlier with a stolen password can't be used.

**Missed the hour, or lost your phone?** Reopen setup for an hour. This also removes the old authenticator:

```sql
update public.admin_users
set mfa_factor_id = null, mfa_setup_until = now() + interval '1 hour'
where user_id = (select id from auth.users where email = 'you@example.com');
```

## Plans and billing

Plans are data: edit prices and limits at `/admin/plans`. Every edit is in the audit log. Starting values:

| | Trial (14 days) | Starter | Pro |
|---|---|---|---|
| Price per month | Free | ₹1,499 | ₹3,999 |
| Events per month | 1 | 4 | 15 |
| Photos per event | 300 | 1,500 | 5,000 |
| Team seats | 2 | 3 | 10 |
| Gallery days | 7 | 7 | 30 |
| Credit on guest galleries | Yes | Yes | No |

**Limits are enforced in the database.** Events count toward the month they take place in, in India time. Lowering a limit never removes anything; it only stops new events, photos or seats beyond it. Studios see plain messages like "You've used 4 of 4 events for December 2026 on the Starter plan. Upgrade to Pro for 15."

**When access runs out:**
- Trial ended, or payment more than 7 days late: no new events and no going live. An event that's already live keeps capturing until 12 hours after it ends.
- 1 to 7 days late: everything still works, with a "Payment due" banner.
- Suspended (by an admin): nothing new at all.

**Getting paid (manual for now):**
1. A studio owner chooses a plan on `/dashboard/billing`. It shows up under **Upgrade requests** on the admin overview.
2. They pay you by UPI or bank transfer.
3. Click **Record payment**: pick the plan and months; the amount fills in. The studio moves to that plan, is marked paid from today (or from the end of its current period), and the request closes.

**Change plan** on a studio's page moves it without a payment (complimentary, or a downgrade). Payment records are kept even if a studio is deleted. Razorpay can add the same payment rows later; the `(method, reference)` pair is unique, so a webhook can't record one payment twice.

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
4. Under **Authentication → Multi-Factor**, check that TOTP (app authenticator) is enabled. It is by default.
5. In Netlify, add the four variables from `.env.example` under **Site configuration → Environment variables**. `netlify.toml` sets the build command and Node version.

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
