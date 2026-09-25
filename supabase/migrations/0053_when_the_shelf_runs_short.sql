-- ============================================================
-- When the shelf runs short, say so.
--
-- `apply_order_stock` subtracts and never argues:
--
--     update batches set batch_stock = batch_stock - req.qty ...
--
-- There is no `check (batch_stock >= 0)`, and there should not be one. By the
-- time this runs the food has already left the kitchen — refusing the write
-- would roll back the whole sale and leave the shop with a served customer
-- and no record of serving them. 0016 made exactly that call for ingredients,
-- in as many words: a shortfall is "recorded rather than refused".
--
-- The problem was never that stock goes negative. It is that it went negative
-- SILENTLY. Nothing in the app reads a negative, so the one number that says
-- "what you counted and what you sold do not agree" sat in a column nobody
-- looked at, and the next person to trust the count inherited the error.
--
-- The app-side check added in #128 stops the ordinary case. It cannot stop
-- two tills confirming in the same second: both read the same shelf, both
-- pass, both apply. That race is rare in a one-counter stall and it is not
-- worth a lock — but when it does happen the shop should hear about it.
--
-- So: the subtraction stays exactly as it was, and the MOMENT a shelf crosses
-- below zero is written to the activity log, under `movement` ("Stock moved"),
-- which History has had a filter chip for since the log was first shown.
--
-- Only the crossing is logged, not every sale off an already-negative shelf.
-- The standing negative is a state, and Inventory now shows it continuously;
-- the log answers the other question, which is when it started.
-- ============================================================

-- ============================================================
-- consume_ingredient — unchanged except that it now notices
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
  v_name text;
  v_unit text;
  v_after numeric;
  lot record;
begin
  if p_qty is null or p_qty <= 0 then return 0; end if;

  select cost, name, unit into v_standard, v_name, v_unit
  from ingredients where id = p_ingredient_id;
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

  update ingredients set stock = stock - p_qty
  where id = p_ingredient_id
  returning stock into v_after;

  insert into consumption_log (ingredient_id, date, qty, type)
  values (p_ingredient_id, p_date, p_qty, p_type);

  -- The crossing, not the state. `v_after + p_qty` is what was on the shelf a
  -- line ago, so this fires once — on the sale that took it under — and stays
  -- quiet for every sale after that off the same short shelf.
  if v_after < 0 and v_after + p_qty >= 0 then
    insert into activity_log (date, category, description)
    values (
      p_date,
      'movement',
      v_name || ' went below zero: short by ' ||
      trim(to_char(abs(v_after), 'FM999999990.###')) || ' ' ||
      coalesce(v_unit, 'units') ||
      ' after this ' || coalesce(p_type, 'movement') ||
      '. The count was higher than what was really there — recount when you can.'
    );
  end if;

  return v_cost;
end;
$$;

-- ============================================================
-- apply_order_stock — same, for the prepped side
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
  v_after numeric;
  v_name text;
  v_unit text;
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

      update batches set batch_stock = batch_stock - req.qty
      where id = req.ref_id
      returning batch_stock, name, yield_unit into v_after, v_name, v_unit;

      v_cogs := v_cogs + req.qty * coalesce(v_per_unit, 0);

      -- Same crossing test as the ingredient side. A batch has no lots to run
      -- down, so this is the only place its shortfall can be caught.
      if v_after is not null and v_after < 0 and v_after + req.qty >= 0 then
        insert into activity_log (date, category, description)
        values (
          v_date,
          'movement',
          v_name || ' went below zero: short by ' ||
          trim(to_char(abs(v_after), 'FM999999990.###')) || ' ' ||
          coalesce(v_unit, 'units') ||
          ' after this sale. More was sold than was recorded as made — ' ||
          'either a batch was produced without logging it, or the count was wrong.'
        );
      end if;
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
-- Re-assert the grants
--
-- `create or replace` keeps the privileges a function already had, so this is
-- belt and braces rather than a fix. It costs nothing and it means the two
-- functions above can never be left reachable by the anon key because a
-- replace somewhere down the line was written without 0016 in front of it.
-- ============================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'consume_ingredient(text, numeric, date, text)',
    'apply_order_stock(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
