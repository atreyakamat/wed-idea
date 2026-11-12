# Launch setup

Everything here is a one-time setting in an outside service. Nothing in the
code needs to change. Do the steps in order; each one says how to check it
worked.

## 1. Name, support email and legal name

In Netlify → Site configuration → Environment variables, add:

| Variable | Example | Used for |
|---|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | `Saltwater Galleries` | The product name everywhere (leave empty to keep "Cute Wedding Polaroid") |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `hello@yourdomain.in` | Footer, Terms and Privacy contact |
| `NEXT_PUBLIC_LEGAL_NAME` | `Atreya Kamat (sole proprietor)` | Who runs the service, in Terms and Privacy |

Redeploy. **Check:** the footer shows the email, and `/privacy` names the business.

Before launch, have a lawyer read `/terms` and `/privacy` (about an hour of their time).

## 2. Email that works on launch day (Resend, free tier)

Supabase's built-in email sends only a few messages an hour, which isn't enough for real sign-ups.

1. Create a free account at resend.com and add your domain (Domains → Add domain). Add the DNS records it shows at your domain registrar, then wait until it says **Verified**.
2. In Resend → API Keys, create a key with "Sending access".
3. In Supabase → Authentication → Emails → SMTP Settings, turn on **Custom SMTP**:
   - Sender email: `hello@yourdomain.in`; sender name: your product name
   - Host `smtp.resend.com`, port `465`, username `resend`, password: the API key
4. In Supabase → Authentication → URL Configuration:
   - Site URL: `https://yourdomain.in`
   - Redirect URLs: add `https://yourdomain.in/auth/callback`
5. In Supabase → Authentication → Rate Limits, raise "emails per hour" to 100.

**Check:** sign up with a new address, and use "Forgot password?" on the sign-in page. Both emails should arrive within a minute.

## 3. Daily clean-up

This deletes photos 7 days after their gallery closes, as the Privacy policy promises.

1. Make a secret: run `openssl rand -hex 32` (or use any password generator to get 64 random letters and numbers).
2. Netlify → Environment variables: add `CRON_SECRET` with that value. Redeploy.
3. GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret:
   - `CRON_SECRET`: the same value
   - `SITE_URL`: `https://yourdomain.in`
4. GitHub → Actions → **Daily clean-up** → Run workflow.

**Check:** the run is green and its log shows `{"projectPhotos":…,"errors":[]}`. After that it runs by itself every night at 03:07 IST.

## 4. Error alerts (Sentry, free tier)

1. Create a free account at sentry.io → Create project → platform "Next.js" (just to get a project; you don't need their setup wizard).
2. Project settings → Client Keys (DSN) → copy the DSN.
3. Netlify → Environment variables: set **both** `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` to the DSN. Redeploy.

**Check:** errors from the site appear in Sentry. Gallery links, PC-app keys, emails and phone numbers are removed before anything is sent.

## 5. Page counts (optional)

Counts are cookie-free, so no cookie banner is needed. They run only on public pages (home, pricing, polaroid styles, terms, privacy, sign-up), never on galleries or dashboards.

- **Plausible** (paid, about $9 a month): add your site there, then set `NEXT_PUBLIC_ANALYTICS_DOMAIN=yourdomain.in`.
- **A free Plausible-compatible service** (for example self-hosted Plausible or Umami's Plausible mode): also set `NEXT_PUBLIC_ANALYTICS_SCRIPT` to its script address.

## 6. Database

1. `npx supabase link --project-ref <your ref>` (once), then `npx supabase db push` to apply new migrations.
2. Supabase → Database → Backups: daily backups come with the Pro plan (about $25 a month). Turn it on before real customers' photos are stored.

## 7. PC app downloads

1. Merge the PC app PR, then publish the first release from your computer:
   `git tag pc-app-v0.1.0 && git push origin pc-app-v0.1.0`
2. GitHub builds the Windows and Mac installers (about 10 minutes) and
   attaches them to a release. The dashboard's download buttons point to
   the latest release, so nothing else to set.
3. Optional, later (paid): code-signing removes the "unknown app" warning on
   first open. It needs an Apple Developer account and a Windows signing
   certificate.

## 8. Before you post on Product Hunt

- [ ] Steps 1–4 done and checked
- [ ] Your own studio logo uploaded (Studio page)
- [ ] One real shoot delivered end to end: PC app → gallery → WhatsApp → a guest saving photos on an iPhone and an Android phone
- [ ] A public demo gallery you're happy for anyone to see (a styled shoot with consent from everyone in it), with its link in the launch post
