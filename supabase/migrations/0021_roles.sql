-- ============================================================
-- A manager, and staff who can't see the books
--
-- This database has had two kinds of person since the first migration:
-- "staff" and "owner". `is_staff()` was the gate on nearly everything, and it
-- is far wider than it reads — anyone marked staff could change any price,
-- read every ingredient's purchase cost, write to the cash ledger and see the
-- month's takings. For a stall where the counter is worked by whoever is free
-- that day, that is the whole business handed over along with the till.
--
-- Three roles now:
--   staff    — the counter and the orders. Sees stock counts, logs waste.
--   manager  — runs a service. Restocks, cooks batches, marks a dish sold
--              out. Still cannot change a price or see what anything earns.
--   owner    — everything.
--
-- The app checks the same thing in `src/lib/permissions.ts`, and that is what
-- shapes the screens. This file is what makes it true: a request that goes
-- around the app — a stolen anon key, a curl at the REST endpoint — meets
-- these policies instead.
-- ============================================================

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner', 'manager', 'staff', 'customer'));

-- ============================================================
-- The predicates
--
-- `is_staff()` keeps its meaning — "does this person work here" — and gains
-- manager, so every policy that only ever meant to say "not a customer"
-- carries on working. The narrower questions get their own functions rather
-- than being spelled out inline in forty policies, where one of them would
-- eventually be spelled differently.
-- ============================================================

create or replace function is_staff()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('owner', 'manager', 'staff')
  );
$$;

/* Manager or above: may move stock and money-less kitchen data. */
create or replace function is_manager()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('owner', 'manager')
  );
$$;

-- ============================================================
-- Narrowing what staff may write
--
-- Each of these was `is_staff()` — everyone who works here — and is now the
-- narrowest role that has a reason to do it. The tables are grouped by why,
-- not by name, because the "why" is what a future reader needs.
-- ============================================================

/* The recipe book and the shelf. A price per gram is a cost, and a cost is
   the owner's business; changing what goes into a dish changes what it costs
   to make. Manager and above. */
do $$
declare t text;
begin
  foreach t in array array[
    'ingredients', 'ingredient_lots', 'purchase_log', 'batches',
    'batch_ingredients', 'meal_ingredients', 'meal_components', 'cycle_counts'
  ]
  loop
    execute format('drop policy if exists "staff_all_%s" on %I', t, t);
    execute format('drop policy if exists "manager_all_%s" on %I', t, t);
    execute format(
      'create policy "manager_all_%s" on %I for all using (is_manager()) with check (is_manager())',
      t, t
    );
  end loop;
end $$;

/* Packaging is a recipe by another name. */
drop policy if exists "staff_write_meal_packaging" on meal_packaging;
drop policy if exists "manager_write_meal_packaging" on meal_packaging;
create policy "manager_write_meal_packaging" on meal_packaging
  for all using (is_manager()) with check (is_manager());
drop policy if exists "staff_write_order_packaging" on order_packaging;
drop policy if exists "manager_write_order_packaging" on order_packaging;
create policy "manager_write_order_packaging" on order_packaging
  for all using (is_manager()) with check (is_manager());

/* The money. Cash in the drawer, what customers owe, the shop's own costs,
   and every setting including the GCash number people pay into. Owner. */
do $$
declare t text;
begin
  foreach t in array array['cash_ledger', 'receivables', 'oe_templates', 'settings']
  loop
    execute format('drop policy if exists "staff_all_%s" on %I', t, t);
    execute format('drop policy if exists "owner_all_%s" on %I', t, t);
    execute format(
      'create policy "owner_all_%s" on %I for all using (is_owner()) with check (is_owner())',
      t, t
    );
  end loop;
end $$;

/* No public-read exception here, deliberately. `settings` is NOT the shop
   front's settings — opening hours, delivery fees and the GCash QR live in
   shop_hours, delivery_settings and payment_settings, which have their own
   policies and are untouched. This table holds `cash_reserve`,
   `cash_balance_starting_amount` and the like. Owner-only is the whole point,
   and nothing customer-facing reads it. */

/* Waste is the one kitchen table staff keep. Throwing away a burnt batch is
   the moment it happens, at the counter, by whoever burnt it — and a system
   that makes that need a manager is a system where waste stops being logged.
   Consumption is the same call from the other side: selling a dish writes it. */
drop policy if exists "staff_all_waste_log" on waste_log;
create policy "staff_all_waste_log" on waste_log
  for all using (is_staff()) with check (is_staff());
drop policy if exists "staff_all_consumption_log" on consumption_log;
create policy "staff_all_consumption_log" on consumption_log
  for all using (is_staff()) with check (is_staff());
-- (Both re-created under their original names, so re-running is a no-op.)

-- ============================================================
-- The menu: two different powers that used to be one
--
-- "This is sold out today" and "this now costs ₱149" were the same
-- permission, because both are an UPDATE on `meals`. They are not the same
-- decision, and the first one has to happen mid-service by whoever notices.
--
-- Postgres can't express "may update only these columns" in a policy, so the
-- split is a trigger: a manager's UPDATE is allowed through, but any column
-- other than availability is put back to what it was. Not rejected — put
-- back — so a manager toggling sold-out on a form that also posts the price
-- can't have the price ride along on the same request.
-- ============================================================

create or replace function guard_meal_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- The owner, and anything running as the service role with no session
  -- (the app's own server actions, which have already checked), pass through.
  if auth.uid() is null or is_owner() then
    return new;
  end if;

  if is_manager() then
    -- Availability only. Every other column is pinned to its old value.
    new.id := old.id;
    new.name := old.name;
    new.price := old.price;
    new.description := old.description;
    new.categories := old.categories;
    new.image_url := old.image_url;
    new.kind := old.kind;
    new.is_public := old.is_public;
    return new;
  end if;

  -- Staff may not change a dish at all.
  raise exception 'Only a manager or the owner can change the menu';
end $$;

drop trigger if exists guard_meal_columns on meals;
create trigger guard_meal_columns
  before update on meals
  for each row execute function guard_meal_columns();

drop policy if exists "staff_write_meals" on meals;
drop policy if exists "owner_write_meals" on meals;
create policy "owner_write_meals" on meals for insert with check (is_owner());
drop policy if exists "staff_delete_meals" on meals;
drop policy if exists "owner_delete_meals" on meals;
create policy "owner_delete_meals" on meals for delete using (is_owner());
/* The UPDATE policy still admits staff — the trigger above is what decides
   what they may actually change, and it needs the statement to reach it. */
drop policy if exists "staff_update_meals" on meals;
create policy "staff_update_meals" on meals
  for update using (is_staff()) with check (is_staff());

-- ============================================================
-- Reading what the shop earns
--
-- `orders` carries the price the customer pays AND what the shop made on it.
-- Those are two different secrets. `revenue` is not one at all — staff take
-- that money at the counter and hand over a receipt for it. `cogs`, `oe`,
-- `gross_profit` and `net_profit` are: they are the margin, and they are the
-- number the owner asked to keep off the staff screens.
--
-- Staff have to read `orders` — it is the board they work from — so the
-- profit columns can't be kept out of the table by RLS, which is row-level
-- and not column-level. This view is what the staff-facing screens select
-- from instead, so "don't show the margin" is enforced by what comes back
-- rather than by every screen being trusted to leave it out.
--
-- `security_invoker` matters: without it the view would run as its owner and
-- hand back every order regardless of who asked. With it, the caller's own
-- row policies still apply and a customer sees only their own.
-- ============================================================
create or replace view orders_for_staff
with (security_invoker = true)
as
  select
    id, created_at, date, customer_id, status, fulfillment, scheduled_for,
    contact_name, contact_phone, notes, tag, logged_by, shift_id,
    delivery_address, delivery_lat, delivery_lng, delivery_distance_km,
    delivery_fee, revenue,
    eta_minutes, eta_set_at, cancelled_reason,
    payment_status, payment_method, payment_plan, payment_reference,
    payment_receipt_url, downpayment_amount, downpayment_confirmed_at, paid_at
  from orders;

grant select on orders_for_staff to authenticated, anon;

/* And the wall behind the view.

   Postgres privileges ARE column-level even though policies are not, so the
   margin can be taken away outright from every browser-side session. Without
   this the view is only a convention: anyone signed in could ask the REST
   endpoint for `orders?select=cogs` directly and get it, whatever the screens
   choose to render.

   It has to be done in this order. A column-level REVOKE cannot carve a hole
   in a whole-table GRANT — the two are tracked separately, and the table-level
   privilege keeps answering yes. So the table grant goes first, and then only
   the columns that are not the margin are granted back.

   Generated rather than typed out, so a column added to `orders` next year is
   readable by default and only the four named here stay behind the wall. The
   alternative — a hand-written list — fails by silently hiding a new column
   from the customer's own order page, which looks like a bug in the app and
   not like a permission. */
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders'
    and column_name not in ('cogs', 'oe', 'gross_profit', 'net_profit');

  execute 'revoke select on orders from anon, authenticated';
  execute format('grant select (%s) on orders to anon, authenticated', cols);
end $$;

-- Shift rows are already own-or-owner from 0018; nothing to change here.
