-- ============================================================
-- Stock that actually moves.
--
-- Until now `ingredients.stock` has been a number nothing ever changed:
-- selling a bowl of noodles did not reduce the pork. This makes a sale, and
-- the cancellation of a sale, move real stock.
--
-- WHY THIS IS SQL AND NOT TYPESCRIPT
-- A single order can touch a dozen ingredients. supabase-js has no
-- transactions, so doing this from the app means a dozen separate round
-- trips — and if the seventh fails, the shop is left with stock half
-- deducted and no record of how far it got. That is the kind of bug that
-- silently poisons every figure built on top of it. In here it is one
-- statement: all of it happens, or none of it does.
-- ============================================================

-- Applied-once marker. Same claim-before-acting pattern as `eta_alerted_at`:
-- a status can be set twice by two staff on two phones, and stock must move
-- exactly once.
alter table orders add column if not exists stock_applied_at timestamptz;
create index if not exists idx_orders_stock_applied
  on orders(stock_applied_at) where stock_applied_at is null;

-- ============================================================
-- What a batch costs per unit of its yield
-- ============================================================
create or replace function batch_cost_per_unit(p_batch_id text)
returns numeric
language plpgsql
stable
as $$
declare
  v_manual numeric;
  v_yield numeric;
  v_total numeric;
begin
  select manual_cost_per_unit, yield_qty into v_manual, v_yield
  from batches where id = p_batch_id;

  if v_manual is not null and v_manual > 0 then
    -- A repack — bought ready-made and split into portions. It has no recipe
    -- by design, so its cost is the number that was typed in.
    return v_manual;
  end if;

  if v_yield is null or v_yield <= 0 then
    return 0; -- no yield, so there is no per-unit cost to state
  end if;

  select coalesce(sum(bi.qty * i.cost), 0) into v_total
  from batch_ingredients bi
  join ingredients i on i.id = bi.ingredient_id
  where bi.batch_id = p_batch_id;

  return v_total / v_yield;
end;
$$;

-- ============================================================
-- Take stock off the shelf, oldest-expiring first
--
-- Returns what was actually consumed in pesos. That is not the same as
-- qty × today's price: if half of it came from a lot bought cheaply last
-- week, the shop's cost is the cheap price for that half. Standard cost is
-- only used for a shortfall — stock going negative because the count was
-- optimistic — which is recorded rather than refused, because the food has
-- already left the kitchen either way.
-- ============================================================
create or replace function consume_ingredient(
  p_ingredient_id text,
  p_qty numeric,
  p_date date,
  p_type text
)
returns numeric
language plpgsql
as $$
declare
  v_remaining numeric := p_qty;
  v_cost numeric := 0;
  v_take numeric;
  v_standard numeric;
  lot record;
begin
  if p_qty is null or p_qty <= 0 then return 0; end if;

  select cost into v_standard from ingredients where id = p_ingredient_id;
  if not found then
    -- A recipe pointing at a deleted ingredient. Nothing to take, and the
    -- costing screens already flag it by name.
    return 0;
  end if;

  for lot in
    select id, qty, cost from ingredient_lots
    where ingredient_id = p_ingredient_id and qty > 0
    -- First-expiry-first-out: the tub that goes off on Friday is the tub you
    -- cook with today. A plain FIFO would leave it to be thrown away.
    order by coalesce(expiry_date, '9999-12-31'::date),
             coalesce(received_date, '1900-01-01'::date),
             id
  loop
    exit when v_remaining <= 0.00001;
    v_take := least(lot.qty, v_remaining);
    update ingredient_lots set qty = qty - v_take where id = lot.id;
    v_cost := v_cost + v_take * coalesce(lot.cost, 0);
    v_remaining := v_remaining - v_take;
  end loop;

  delete from ingredient_lots
  where ingredient_id = p_ingredient_id and qty <= 0.0001;

  if v_remaining > 0.00001 then
    v_cost := v_cost + v_remaining * coalesce(v_standard, 0);
  end if;

  update ingredients set stock = stock - p_qty where id = p_ingredient_id;
  insert into consumption_log (ingredient_id, date, qty, type)
  values (p_ingredient_id, p_date, p_qty, p_type);

  return v_cost;
end;
$$;

-- Put it back. A cancelled order returns a lot at today's standard cost
-- rather than reconstructing the lots it came from — the originals may have
-- been merged or emptied since, and inventing a history is worse than
-- restoring the quantity honestly.
create or replace function restore_ingredient(
  p_ingredient_id text,
  p_qty numeric,
  p_date date,
  p_type text
)
returns void
language plpgsql
as $$
declare
  v_cost numeric;
begin
  if p_qty is null or p_qty <= 0 then return; end if;
  select cost into v_cost from ingredients where id = p_ingredient_id;
  if not found then return; end if;

  insert into ingredient_lots (ingredient_id, qty, cost, received_date)
  values (p_ingredient_id, p_qty, coalesce(v_cost, 0), p_date);
  update ingredients set stock = stock + p_qty where id = p_ingredient_id;
  -- Logged as a negative so the consumption history nets out. A cancelled
  -- order that left a positive row behind would inflate every usage average
  -- and, through those, every reorder suggestion.
  insert into consumption_log (ingredient_id, date, qty, type)
  values (p_ingredient_id, p_date, -p_qty, p_type);
end;
$$;

-- ============================================================
-- What one order actually needs, combos and all
--
-- A combo contains dishes, which contain batches and ingredients. The
-- recursion walks that; the depth guard is what stops a combo that somehow
-- contains itself from hanging the kitchen instead of ringing up a sale.
-- ============================================================
create or replace function order_requirements(p_order_id text)
returns table (ref_type text, ref_id text, qty numeric)
language sql
stable
as $$
  with recursive meal_tree as (
    select ol.meal_id, ol.qty::numeric as mult, 0 as depth
    from order_lines ol
    where ol.order_id = p_order_id
    union all
    select mc.component_meal_id, mt.mult * mc.qty, mt.depth + 1
    from meal_tree mt
    join meal_components mc on mc.meal_id = mt.meal_id
    where mt.depth < 5
  )
  select mi.ref_type, mi.ref_id, sum(mi.qty * mt.mult)::numeric
  from meal_tree mt
  join meal_ingredients mi on mi.meal_id = mt.meal_id
  group by mi.ref_type, mi.ref_id;
$$;

-- ============================================================
-- Apply an order to stock, exactly once
-- ============================================================
create or replace function apply_order_stock(p_order_id text)
returns numeric
language plpgsql
as $$
declare
  v_date date;
  v_revenue numeric;
  v_cogs numeric := 0;
  v_per_unit numeric;
  req record;
begin
  -- Claim first. Two staff marking the same order "confirmed" at the same
  -- moment must not deduct the pork twice.
  update orders
  set stock_applied_at = now()
  where id = p_order_id and stock_applied_at is null
  returning date, revenue into v_date, v_revenue;

  if not found then
    return null; -- already applied, or no such order
  end if;

  for req in select * from order_requirements(p_order_id) loop
    if req.ref_type = 'inv' then
      v_cogs := v_cogs + consume_ingredient(req.ref_id, req.qty, v_date, 'sale');
    elsif req.ref_type = 'batch' then
      v_per_unit := batch_cost_per_unit(req.ref_id);
      update batches set batch_stock = batch_stock - req.qty where id = req.ref_id;
      v_cogs := v_cogs + req.qty * coalesce(v_per_unit, 0);
    end if;
  end loop;

  -- The cost actually taken off the shelf, which beats the estimate the app
  -- wrote from current recipe prices when the order was created.
  update orders
  set cogs = round(v_cogs, 2),
      gross_profit = round(coalesce(v_revenue, 0) - v_cogs, 2)
  where id = p_order_id;

  return round(v_cogs, 2);
end;
$$;

-- ============================================================
-- Undo it, exactly once
-- ============================================================
create or replace function reverse_order_stock(p_order_id text)
returns boolean
language plpgsql
as $$
declare
  v_date date;
  req record;
begin
  update orders
  set stock_applied_at = null
  where id = p_order_id and stock_applied_at is not null
  returning date into v_date;

  if not found then
    return false; -- never applied, so there is nothing to give back
  end if;

  for req in select * from order_requirements(p_order_id) loop
    if req.ref_type = 'inv' then
      perform restore_ingredient(req.ref_id, req.qty, v_date, 'cancel');
    elsif req.ref_type = 'batch' then
      update batches set batch_stock = batch_stock + req.qty where id = req.ref_id;
    end if;
  end loop;

  update orders set cogs = 0, gross_profit = 0 where id = p_order_id;
  return true;
end;
$$;

-- ============================================================
-- Only the server may move stock
--
-- Postgres grants EXECUTE to PUBLIC on a new function by default, and the
-- anon key is in every visitor's browser. These are revoked and handed back
-- to the service role alone, so moving stock is something the app does on a
-- checked path and not something a token can ask the database for directly.
-- ============================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'batch_cost_per_unit(text)',
    'consume_ingredient(text, numeric, date, text)',
    'restore_ingredient(text, numeric, date, text)',
    'order_requirements(text)',
    'apply_order_stock(text)',
    'reverse_order_stock(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- ============================================================
-- An audit trail the audited party cannot edit
--
-- `for all` included UPDATE and DELETE, so a staff member could quietly
-- remove their own entries from the log that exists to record what they did.
-- Staff may write to it and read it; nobody may change or remove a line.
-- ============================================================
drop policy if exists "staff_all_activity_log" on activity_log;
-- Dropped first so running this file twice is harmless. Every other statement
-- here is already `or replace` / `if not exists`; these two were the one way
-- a re-run could fail half way and leave the rest unapplied.
drop policy if exists "staff_insert_activity_log" on activity_log;
drop policy if exists "staff_select_activity_log" on activity_log;
create policy "staff_insert_activity_log" on activity_log
  for insert with check (is_staff());
create policy "staff_select_activity_log" on activity_log
  for select using (is_staff());
