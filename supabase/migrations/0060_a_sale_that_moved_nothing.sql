-- ============================================================
-- An order that takes nothing off the shelf has to say so
--
-- "Hindi ba nababawas sa stock kapag sa online nag-oorder?"
--
-- It is — and the machinery is right. Measured end to end against this
-- schema: two dishes with one add-on each, for delivery, moved 240g of pork,
-- 200g of rice, two boxes and one bag, and booked ₱133.50 of cost. Add-ons
-- multiply by the line quantity, per-dish packaging follows the dish,
-- per-order packaging goes once. A `pending` order moves nothing, which is
-- deliberate: the ingredients stop being available when the shop COMMITS to
-- cooking, not when a stranger fills a cart.
--
-- What is wrong is the other case, and it is the one a new menu is full of:
--
--     a dish with no recipe asks for nothing,
--     so nothing is deducted,
--     so cogs is ₱0.00,
--     so the order reads as 100% margin,
--     and nothing, anywhere, says a word about it.
--
-- Measured: `order_requirements` returns 0 rows, `apply_order_stock` returns
-- 0.00, `activity_log` gains 0 lines, and the order sits there looking like
-- the best sale the shop ever made. The owner watches the shelf not move and
-- reasonably concludes the deduction is broken.
--
-- Other screens already warn about dishes with no recipe — the costing page,
-- the modifier editor, the till badge. None of them are open at the moment a
-- sale goes through, and none of them are where somebody looks when the
-- symptom is "my stock is wrong". So the sale itself says it, on the log that
-- records what moved, at the moment it fails to move.
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
  v_ticket int;
  v_who text;
  v_blind text;
  req record;
begin
  -- Claim first. Two staff marking the same order "confirmed" at the same
  -- moment must not deduct the pork twice.
  update orders
  set stock_applied_at = now()
  where id = p_order_id and stock_applied_at is null
  returning date, revenue, ticket, contact_name
    into v_date, v_revenue, v_ticket, v_who;

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

  -- ----------------------------------------------------------
  -- And the silence this migration exists to break
  --
  -- A dish with no recipe asks for nothing, so the loop above runs zero
  -- times: no stock moves, cogs is 0.00, gross profit is the whole ticket,
  -- and not one line anywhere says why. The order reads as a perfect sale.
  -- That is not a missing feature, it is the shop being told something
  -- untrue by a screen that looks completely normal — and it is exactly
  -- what "why is my stock not going down" turns out to be.
  -- ----------------------------------------------------------
  select string_agg(distinct m.name, ', ' order by m.name)
    into v_blind
  from (
    select ol.meal_id from order_lines ol where ol.order_id = p_order_id
    union
    select e.meal_id
    from order_line_extras e
    join order_lines ol on ol.id = e.order_line_id
    where ol.order_id = p_order_id and e.meal_id is not null
  ) d
  join meals m on m.id = d.meal_id
  where not exists (
    -- Nothing in its own recipe, and nothing in any dish it is built from.
    -- A combo whose components carry the ingredients is fully costed and
    -- must not be named here.
    with recursive tree as (
      select d.meal_id as id, 0 as depth
      union all
      select mc.component_meal_id, t.depth + 1
      from tree t
      join meal_components mc on mc.meal_id = t.id
      where t.depth < 5
    )
    select 1 from tree t join meal_ingredients mi on mi.meal_id = t.id
  );

  if v_blind is not null then
    insert into activity_log (date, category, description)
    values (
      v_date,
      'movement',
      /* Two openings, because one of them would be a lie half the time.

         An order can be part-costed: the ramen deducts, the iced tea beside
         it does not. Saying "nothing came off the shelf" there is confidently
         wrong, and a warning that is wrong on the first read is a warning
         nobody trusts on the second. */
      case when v_cogs > 0
        then 'Part of '
        else 'Nothing came off the shelf for '
      end ||
      coalesce('#' || v_ticket::text, 'an order') ||
      coalesce(' (' || v_who || ')', '') ||
      case when v_cogs > 0 then ' took nothing off the shelf: ' else ': ' end ||
      v_blind ||
      case when strpos(v_blind, ',') > 0 then ' have' else ' has' end ||
      ' no recipe. What they sold for is counted and what they cost is not, ' ||
      'so that part of the order reads as pure profit until a recipe is added.'
    );
  end if;

  return round(v_cogs, 2);
end;
$$;


-- `create or replace` keeps the privileges a function already had. Re-asserted
-- anyway, for the reason 0053 gave: a replace written later without 0016 in
-- front of it must not be able to leave this reachable by the anon key.
do $$
begin
  execute 'revoke all on function apply_order_stock(text) from public, anon, authenticated';
  execute 'grant execute on function apply_order_stock(text) to service_role';
end $$;
