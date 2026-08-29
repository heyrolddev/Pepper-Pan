-- Pepper Pan — storage upload policies + idempotent re-create of staff policies
-- Run this once in the Supabase SQL Editor, after 0002.
--
-- Two things this fixes:
--   1. Staff could not upload meal photos, because the storage bucket had no
--      write policy (public buckets are public to READ only).
--   2. Re-creates the staff write policies on the business tables. They are
--      written drop-then-create so running this is safe and repeatable — if
--      any policy failed to apply earlier, this repairs it.

-- ============================================================
-- MEALS — staff manage the menu
-- ============================================================
drop policy if exists "staff_write_meals" on meals;
create policy "staff_write_meals" on meals for insert with check (is_staff());

drop policy if exists "staff_update_meals" on meals;
create policy "staff_update_meals" on meals for update
  using (is_staff()) with check (is_staff());

drop policy if exists "staff_delete_meals" on meals;
create policy "staff_delete_meals" on meals for delete using (is_staff());

drop policy if exists "public_select_meals" on meals;
create policy "public_select_meals" on meals for select
  using ((is_public = true and is_available = true) or is_staff());

-- ============================================================
-- ORDERS — staff manage every order
-- ============================================================
drop policy if exists "customer_update_own_orders" on orders;
create policy "customer_update_own_orders" on orders for update
  using (is_staff() or (customer_id = auth.uid() and status = 'pending'))
  with check (is_staff() or (customer_id = auth.uid() and status = 'pending'));

drop policy if exists "customer_select_own_orders" on orders;
create policy "customer_select_own_orders" on orders for select
  using (customer_id = auth.uid() or is_staff());

-- ============================================================
-- STORAGE — staff may upload meal photos to the PepperPan bucket.
-- The bucket being "public" only grants READ; writes still need a policy.
-- ============================================================
drop policy if exists "staff_insert_pepperpan" on storage.objects;
create policy "staff_insert_pepperpan" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'PepperPan' and public.is_staff());

drop policy if exists "staff_update_pepperpan" on storage.objects;
create policy "staff_update_pepperpan" on storage.objects
  for update to authenticated
  using (bucket_id = 'PepperPan' and public.is_staff())
  with check (bucket_id = 'PepperPan' and public.is_staff());

drop policy if exists "staff_delete_pepperpan" on storage.objects;
create policy "staff_delete_pepperpan" on storage.objects
  for delete to authenticated
  using (bucket_id = 'PepperPan' and public.is_staff());
