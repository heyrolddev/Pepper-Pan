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

4. (Optional) Import existing business data from `data/pepperpan_backup.json`
   (not tracked in git):

   ```bash
   node --env-file=.env.local scripts/seed.mjs
   ```

5. In Supabase, go to Authentication → URL Configuration and add your site's
   URL (and `http://localhost:3000` for local dev) to both the Site URL and
   Redirect URLs — customer sign-in uses email magic links that redirect to
   `/auth/callback` on whichever origin the app is running on.

6. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — the homepage renders
   the public menu (meals marked `is_public` and `is_available` in Supabase).
   Customers can add items to a cart, sign in with an emailed magic link, place
   an order, and see their order history at `/orders`.

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

- `src/app` — Next.js App Router pages: `/` (menu), `/cart`, `/login`
  (magic-link sign-in), `/checkout`, `/orders` (order history), and
  `/auth/callback` (exchanges the magic-link code for a session).
- `src/app/checkout/actions.ts` — server-side order placement; re-fetches
  current menu prices rather than trusting the client-side cart total.
- `src/lib/cart-context.tsx` — client-side cart state, persisted to
  `localStorage`.
- `src/lib/supabase` — Supabase client factories: `client.ts` (browser),
  `server.ts` (server components/actions, respects RLS), `admin.ts`
  (service-role, server-only, bypasses RLS — used by `scripts/seed.mjs`).
- `src/proxy.ts` — refreshes the Supabase auth session cookie on every
  request (this Next.js version renamed `middleware.ts` to `proxy.ts`).
- `supabase/migrations` — SQL schema and RLS policies.

## Roles

`profiles.role` is one of `owner`, `staff`, or `customer` (default). Staff and
owners get full back-office access via RLS; customers can only see/manage
their own orders and the public menu.
