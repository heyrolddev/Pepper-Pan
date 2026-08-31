-- ============================================================
-- Making a batch
--
-- The shop's 26 sauces and marinades are cooked in bulk and then drawn on by
-- the dishes. Until now `batches.batch_stock` could only ever go down: sales
-- consumed it and nothing put it back, so every sauce was on a slow march to
-- zero with no way to say "we made more this morning".
--
-- Same reasoning as 0016 for why this is SQL rather than TypeScript: Black
-- Pepper Sauce alone takes thirteen ingredients, and thirteen separate round
-- trips means a failure half way leaves ingredients consumed for a batch that
-- was never added.
-- ============================================================

create or replace function produce_batch(
  p_batch_id text,
  p_multiplier numeric
)
returns numeric
language plpgsql
as $$
declare
  v_yield numeric;
  v_manual numeric;
  v_cost numeric := 0;
  v_lines int := 0;
  ing record;
begin
  if p_multiplier is null or p_multiplier <= 0 then
    raise exception 'How many batches? Must be more than zero.';
  end if;

  select yield_qty, manual_cost_per_unit into v_yield, v_manual
  from batches where id = p_batch_id;
  if not found then
    raise exception 'That batch no longer exists.';
  end if;
  if v_yield is null or v_yield <= 0 then
    raise exception 'This batch has no yield set, so there is no amount to add.';
  end if;

  for ing in
    select ingredient_id, qty from batch_ingredients where batch_id = p_batch_id
  loop
    v_cost := v_cost + consume_ingredient(
      ing.ingredient_id, ing.qty * p_multiplier, current_date, 'batch'
    );
    v_lines := v_lines + 1;
  end loop;

  -- A repack has no recipe by design: it is a bought item split into
  -- portions, and its cost is typed in rather than derived. Producing one
  -- would consume nothing and cost nothing, which is not a batch being made —
  -- it is a number being invented.
  if v_lines = 0 and v_manual is null then
    raise exception 'This batch has no recipe yet, so there is nothing to make it from.';
  end if;

  update batches
  set batch_stock = batch_stock + (v_yield * p_multiplier)
  where id = p_batch_id;

  return round(v_cost, 2);
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array['produce_batch(text, numeric)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
