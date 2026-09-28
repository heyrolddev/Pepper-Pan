-- ============================================================
-- 0063 — a whole dish can be thrown away, or eaten by staff
--
-- THE ASK
--
-- The waste log takes an INGREDIENT or a BATCH. But what actually gets
-- thrown away at a stall is usually neither: it is a finished meal. A
-- serving dropped on the way to a table, a bowl cooked for the wrong
-- order, a plate the staff ate at the end of the shift.
--
-- Today that has to be logged as its parts — 180g noodles, 100g chicken,
-- one egg, a sachet of sauce — which nobody is going to do while a queue is
-- waiting, so it does not get logged at all. And an unlogged staff meal is
-- stock that walked off the shelf with no entry against it: the count drifts
-- from the shelf, and the shop concludes the system cannot be trusted.
--
-- WHAT IT COSTS
--
-- The COGS, never the price. A staff meal is not a ₱179 sale the shop
-- missed; it is the ₱62 of pork, noodles and egg that left the building.
-- Writing the menu price into the waste log would overstate every loss and
-- make the month look like a disaster that never happened.
--
-- PACKAGING IS NOT INCLUDED, ON PURPOSE
--
-- `order_requirements` adds a box when the order is not dine-in, because an
-- order knows how it was served. A waste line does not: a dropped meal may
-- have been boxed and may not. So this deducts the FOOD — ingredients,
-- batches and components — and leaves the box to be logged on its own, which
-- it already can be. Guessing would put a box in the books every time a
-- staff member eats standing at the counter.
-- ============================================================

-- ------------------------------------------------------------
-- 1. What one dish takes off the shelf
--
-- The same recursion `order_requirements` walks, over one meal instead of an
-- order's lines. Split out rather than copied into the caller so the two
-- cannot drift on the one rule they share: a combo is its components, five
-- levels deep, and the depth cap is what stops a combo that contains itself
-- from hanging the till.
-- ------------------------------------------------------------
create or replace function meal_requirements(p_meal_id text, p_qty numeric)
returns table (ref_type text, ref_id text, qty numeric)
language sql
stable
as $$
  with recursive meal_tree as (
    select p_meal_id as meal_id, coalesce(p_qty, 0)::numeric as mult, 0 as depth
    union all
    select mc.component_meal_id, mt.mult * mc.qty, mt.depth + 1
    from meal_tree mt
    join meal_components mc on mc.meal_id = mt.meal_id
    where mt.depth < 5
  )
  select mi.ref_type, mi.ref_id, sum(mi.qty * t.mult)::numeric as qty
  from meal_tree t
  join meal_ingredients mi on mi.meal_id = t.meal_id
  group by mi.ref_type, mi.ref_id;
$$;

comment on function meal_requirements(text, numeric) is
  'What `p_qty` servings of one dish take off the shelf — ingredients and '
  'batches, through its components. No packaging: an order knows whether it '
  'left in a box and a waste line does not.';

-- ------------------------------------------------------------
-- 2. Take it, and say what it cost
--
-- Returns the COGS so the caller can price the line without a second walk
-- of the same recipe — one read of the truth, not two that can disagree.
-- ------------------------------------------------------------
create or replace function consume_meal(
  p_meal_id text,
  p_qty numeric,
  p_date date,
  p_type text
)
returns numeric
language plpgsql
as $$
declare
  v_cogs numeric := 0;
  v_per_unit numeric;
  req record;
begin
  if p_qty is null or p_qty <= 0 then return 0; end if;

  for req in select * from meal_requirements(p_meal_id, p_qty) loop
    if req.ref_type = 'inv' then
      /* Through `consume_ingredient`, not a bare UPDATE, so a wasted dish
         takes the same lots in the same order a sold one does — first to
         expire, first out — and lands in `consumption_log` where the usage
         averages and the reorder list read from. A staff meal that skipped
         the log would quietly make every reorder suggestion too small. */
      v_cogs := v_cogs + coalesce(
        consume_ingredient(req.ref_id, req.qty, p_date, p_type), 0
      );
    elsif req.ref_type = 'batch' then
      select batch_cost_per_unit(req.ref_id) into v_per_unit;
      update batches
         set batch_stock = batch_stock - req.qty
       where id = req.ref_id;
      v_cogs := v_cogs + coalesce(v_per_unit, 0) * req.qty;
    end if;
  end loop;

  return v_cogs;
end;
$$;

comment on function consume_meal(text, numeric, date, text) is
  'Take `p_qty` servings of a dish off the shelf and return what it COST — '
  'never what it sells for. A staff meal is not a missed sale; it is the '
  'ingredients that left the building.';

do $$
begin
  execute 'revoke all on function meal_requirements(text, numeric) from public, anon, authenticated';
  execute 'revoke all on function consume_meal(text, numeric, date, text) from public, anon, authenticated';
  execute 'grant execute on function meal_requirements(text, numeric) to service_role';
  execute 'grant execute on function consume_meal(text, numeric, date, text) to service_role';
end $$;

-- ------------------------------------------------------------
-- 3. The log has to be able to say "a dish"
--
-- `source_type` has allowed 'inv' and 'batch' since 0001. A third kind is
-- added rather than squeezed into one of the two, because the reports read
-- this column to decide what a row IS — and a dish filed as a batch would
-- be counted as one everywhere it is grouped.
-- ------------------------------------------------------------
alter table waste_log drop constraint if exists waste_log_source_type_check;
alter table waste_log
  add constraint waste_log_source_type_check
  check (source_type in ('inv', 'batch', 'meal'));

comment on column waste_log.source_type is
  'What was written off: an ingredient (inv), a prepped batch, or a whole '
  'dish (meal). A dish''s total_cost is its COGS, never its menu price.';
