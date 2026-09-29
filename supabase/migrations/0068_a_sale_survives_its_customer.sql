-- ============================================================
-- 0068 — a sale survives its customer
--
-- THE DAY THIS IS ABOUT
--
-- The Supabase project is gone: paused for inactivity and reaped, or
-- deleted, or replaced. The owner makes a new project, runs the
-- migrations, and puts the backup back. That is the one scenario the
-- whole backup feature exists for, and it is the scenario in which it
-- quietly failed worst.
--
-- WHAT WAS FOUND
--
-- `auth.users` belongs to Supabase, not to this schema. The backup does
-- not export it and could not: it holds password hashes and provider
-- tokens that are not ours to copy. So the file arrives in the new
-- project carrying orders, reviews, chat threads, promo redemptions,
-- activity and shifts that all point at accounts existing nowhere.
--
-- Postgres refuses every one of those rows. Proved, not assumed:
--
--   insert into orders (customer_id, ...) values ('<gone>', ...)
--   -->  ERROR: foreign key violation
--
-- And it got much worse than losing those rows. PostgREST sends a chunk
-- of five hundred rows as ONE statement, so one refused row took the
-- other four hundred and ninety-nine with it — including every walk-in
-- order, which had no customer at all and nothing wrong with it. The
-- restore then stopped at the first failing chunk, so the rest of the
-- table never even went in.
--
-- One order belonging to a deleted account lost EVERY SALE THE SHOP HAD
-- EVER MADE, and the screen reported it as one table with an error on it.
--
-- WHAT THIS ADDS
--
-- One question the restore could not ask before: of these account ids,
-- which actually exist here? Everything else is decided in
-- `lib/restore-repair.ts` from the answer — an order whose customer is
-- gone keeps its money, its date, its ticket and its lines and loses only
-- the link; a profile or a shift, which cannot mean anything without the
-- account, is held back and named so the owner can re-invite those people
-- and import again.
-- ============================================================

create or replace function auth_users_present(p_ids uuid[])
returns setof uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  /* Only ever answers about ids the caller already holds, and only with
     yes-or-no by presence. It cannot be used to enumerate the shop's
     accounts: nothing comes back that did not go in. */
  select u.id from auth.users u where u.id = any(p_ids)
$$;

revoke all on function auth_users_present(uuid[]) from public, anon, authenticated;
grant execute on function auth_users_present(uuid[]) to service_role;

comment on function auth_users_present is
  'Which of these auth accounts exist here. Asked by the restore before it '
  'writes rows that reference them — a backup cannot carry auth.users, so '
  'a restore into a fresh project is holding ids that point at nothing.';
