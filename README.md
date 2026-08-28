# Pepper Pan

A Next.js + Supabase site for Pepper Pan: a public menu for customers and a
back office for staff (inventory, batches, orders, waste, finance).

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

5. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — the homepage renders
   the public menu (meals marked `is_public` and `is_available` in Supabase).

## Project structure

- `src/app` — Next.js App Router pages.
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
