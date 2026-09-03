# Pepper Pan

A Next.js + Supabase site for Pepper Pan: a public menu for customers and a
back office for staff (inventory, batches, orders, waste, finance).

See **[docs/OPERATORS-MANUAL.md](docs/OPERATORS-MANUAL.md)** for the owner's
guide: every service and account, what happens when you change something, the
migration rule, and what to do when something breaks.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a [Supabase](https://supabase.com) project, then in the SQL Editor
   run `supabase/migrations/0001_init.sql` to create the schema, tables, and
   row-level security policies.

3. Copy `.env.example` to `.env.local` and fill in the values from
   Project → Settings → API:

   ```bash
   cp .env.example .env.local
   ```

4. (Optional) Load a backup taken from a running shop — HQ → Backup produces
   the file:

   ```bash
   npm run restore pepperpan-backup_2026-08-31_1430.json
   ```

5. In Supabase, go to Authentication → URL Configuration and add your site's
   URL (and `http://localhost:3000` for local dev) to both the Site URL and
   Redirect URLs. Sign-in is email and password; password resets and the
   email confirmation both come back through `/auth/callback`, on whichever
   origin the app is running on.

6. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). The homepage is the
   shop's front page; `/menu` lists what is for sale (meals marked
   `is_public` and `is_available` in Supabase). Customers add items to a
   cart, sign in, order for pickup or delivery, and follow it at `/orders`.

## Checks

```bash
npm test             # 48 tests, Node's own runner — no framework, no deps
npx tsc --noEmit
npm run lint
npm run build        # the same check Vercel runs
```

`tests/` covers the pure logic where being wrong costs money: delivery
pricing, receipt rendering, dish margins, the permission table, and the
upload guards. No database is needed — they are arithmetic and rules.

## Notifications

The shop can reach a phone with the browser closed, and it costs nothing.

Web Push has no account and no vendor behind it — the "key" is a keypair you
generate yourself. Once, on any machine with Node:

```bash
npx web-push generate-vapid-keys
```

Put the two values in the hosting environment (Vercel → Settings →
Environment Variables) as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and
`VAPID_PRIVATE_KEY`, then redeploy. The public one is meant to be public; the
private one must never leave the server.

After that, **⚙ Setup → Alerts** in HQ turns notifications on for whichever
device you're holding — turn it on separately on every phone that should ring.
Customers get the same switch on `/orders`.

Two things worth knowing:

- **Per device, not per account.** A subscription belongs to one browser on
  one phone. Turning it on at home doesn't turn it on at the stall.
- **iPhones need the site installed first.** Safari only allows notifications
  for a site added to the Home Screen (Share → Add to Home Screen). The Alerts
  screen says so and walks through it. Android and desktop work immediately.

With no keys set, the Alerts screen says it isn't configured and everything
else behaves exactly as before. Email status updates (`RESEND_API_KEY`,
`SHOP_FROM_EMAIL`) are optional in the same way.

## Project structure

- `src/app` — Next.js App Router pages: `/` (front page), `/menu`, `/cart`,
  `/checkout`, `/orders`, `/reviews`, `/news`, `/account`, `/login` and
  `/signup` (email and password), and `/auth/callback`.
- `src/app/admin` — HQ, the back office: orders, counter, inventory, costing,
  money, staff, promos, and the rest.
- `src/app/checkout/actions.ts` — server-side order placement; re-fetches
  current menu prices rather than trusting the client-side cart total.
- `src/lib/cart-context.tsx` — client-side cart state, persisted to
  `localStorage`.
- `src/lib/supabase` — Supabase client factories: `client.ts` (browser),
  `server.ts` (server components/actions, respects RLS), `admin.ts`
  (service-role, server-only, bypasses RLS).
- `src/proxy.ts` — refreshes the Supabase auth session cookie on every
  request (this Next.js version renamed `middleware.ts` to `proxy.ts`).
- `supabase/migrations` — SQL schema and RLS policies, numbered and
  append-only. Never edit one that has already been run; add the next.
- `scripts/restore.mjs` — puts a backup file back (`npm run restore`).
- `tests/` — the checks that run on `npm test`.

## Roles

`profiles.role` is one of `owner`, `manager`, `staff`, or `customer`
(default). Access is defined as a table of capabilities in
`src/lib/permissions.ts` — staff, then manager on top of it, then owner on
top of that — so a role can never hold something the role above it lacks.
Call sites name a capability, never a role.

Row Level Security in Postgres is the real gate; hiding a button is not a
permission. A staff account cannot read costs even by querying the database
directly.
