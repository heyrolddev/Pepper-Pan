-- ============================================================
-- 0067 — a GCash screenshot is not public
--
-- WHAT WAS FOUND
--
-- When a customer pays by GCash they may attach a screenshot of the
-- receipt as proof. Those screenshots were being uploaded to `PepperPan`,
-- which is the shop's PUBLIC bucket — the one the menu photos live in —
-- and the public URL was stored on the order.
--
-- A GCash receipt screenshot carries the sender's name, their mobile
-- number, the reference number, the amount, and often the balance left in
-- their wallet. That is a customer's banking screen, sitting on a URL that
-- needs no login to open.
--
-- The path is not guessable one at a time — the order id is a uuid — but
-- that is not what makes something private. A public bucket answers to
-- whoever has the link, the links are stored in a database, and a bucket
-- configured to allow anonymous listing hands over every one of them at
-- once. "Hard to guess" is not a permission.
--
-- The rule this breaks was already written down for backups: customer PII
-- must never go in the public bucket. The receipts went in anyway, because
-- uploading was one shared helper and it only knew one bucket.
--
-- WHAT THIS DOES
--
-- Creates a private bucket for them. New screenshots go there and are read
-- back through a route that checks the viewer is staff first — see
-- `/admin/receipts/[...path]`. Nothing about the menu photos changes.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
-- It does not move the screenshots already uploaded. Supabase keeps the
-- object bytes under `bucket/name` in its own store, so moving the row in
-- `storage.objects` would leave the file behind and break every past
-- order's receipt link — trading a privacy problem for a data-loss one.
-- Those files are named at the end of this migration so the owner can
-- clear them from the dashboard in one action, which is the safe way round.
-- ============================================================

/* Guarded, because the `storage` schema is a Supabase thing and the
   migration checks run against a plain Postgres. A missing storage schema
   there is expected; a missing one on the live project is not, and the
   notice says so rather than failing silently. */
do $$
begin
  if not exists (
    select 1 from information_schema.schemata where schema_name = 'storage'
  ) then
    raise notice '0067: no storage schema here (expected when checking migrations) — skipping the bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('pepperpan-private', 'pepperpan-private', false)
  on conflict (id) do update set public = false;

  raise notice '0067: private bucket ready';
end $$;

/* No storage policies are created on purpose.
   
   Everything that reads or writes this bucket goes through the service
   role: the upload happens in a server action that has already checked the
   order is the caller's, and the read happens in a route handler that has
   already checked the viewer is staff. A policy granting `authenticated`
   any access here would be a second door to the same room, and the point
   of this migration is that there is only one. */

/* What is still sitting in the public bucket, so the owner can see it
   rather than take my word for it. Run this and the count is the number of
   customer banking screenshots currently readable by anyone with the link;
   clear the `receipts/` folder in Storage → PepperPan to deal with them. */
do $$
declare n int;
begin
  if not exists (
    select 1 from information_schema.schemata where schema_name = 'storage'
  ) then
    return;
  end if;
  select count(*) into n from storage.objects
   where bucket_id = 'PepperPan' and name like 'receipts/%';
  if n > 0 then
    raise notice '0067: % receipt screenshot(s) are still in the PUBLIC bucket under receipts/. New ones are private from now on; clear that folder in Storage -> PepperPan when the orders are settled.', n;
  else
    raise notice '0067: nothing left in the public receipts folder';
  end if;
end $$;
