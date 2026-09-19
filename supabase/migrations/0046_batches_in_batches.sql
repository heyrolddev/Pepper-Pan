-- ============================================================
-- 0046 — A batch can be made of other batches
--
-- THE GAP
--
-- `meal_ingredients` has had `ref_type in ('inv','batch')` since 0001, so a
-- DISH can draw on a batch. `batch_ingredients` never did: it points at
-- `ingredients` and nothing else. So a batch can only ever be made of raw
-- ingredients.
--
-- That breaks on the shop's actual prep. Liquid butter is a batch. Marinated
-- ji pai is a batch, and it is made WITH the liquid butter. Today the only
-- way to express that is to re-list every ingredient of the butter inside the
-- ji pai recipe — which means the butter is costed twice in two places, the
-- shop cannot see that it is running out of butter specifically, and changing
-- the butter recipe silently leaves the ji pai wrong.
--
-- WHAT PRODUCING ONE DOES, AND WHAT IT DELIBERATELY DOES NOT
--
-- Making marinated ji pai CONSUMES liquid butter that already exists. It does
-- not go and make the butter first. That is the real kitchen behaviour — you
-- made the butter this morning, and now the ji pai draws it down — and it is
-- also what keeps `produce_batch` finite: no recursion, so no cycle can hang
-- it. Running out of butter fails the way running out of chicken fails.
--
-- Costing is the one place that genuinely recurses, because the cost per unit
-- of ji pai depends on the cost per unit of butter. That is done in
-- TypeScript with an explicit cycle guard — see `costBatches`.
--
-- WHY `ingredient_id` GOES
--
-- Two columns meaning "what this line points at" is two things to keep in
-- step, and the day they disagree nothing says which is right. `ref_type` +
-- `ref_id` is exactly the shape `meal_ingredients` has always used, and the
-- costing code already handles a ref pointing at something deleted — it
-- reports "points at a deleted ingredient" rather than costing it at zero.
-- Same trade, already made once, now made consistently.
-- ============================================================

alter table batch_ingredients
  add column if not exists ref_type text not null default 'inv',
  add column if not exists ref_id text;

-- Every existing line is an ingredient line. Backfilled before the column is
-- made required, so the constraint can never fail on real data.
update batch_ingredients set ref_id = ingredient_id where ref_id is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'batch_ingredients' and column_name = 'ref_id'
      and is_nullable = 'YES'
  ) then
    alter table batch_ingredients alter column ref_id set not null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'batch_ingredients_ref_type_known'
  ) then
    alter table batch_ingredients
      add constraint batch_ingredients_ref_type_known
      check (ref_type in ('inv', 'batch'));
  end if;

  -- A batch made of itself is not a recipe. Caught here for the direct case,
  -- which is the one somebody actually taps by accident; the transitive case
  -- (A → B → A) is caught in `costBatches`, where the whole graph is visible.
  if not exists (
    select 1 from pg_constraint where conname = 'batch_ingredients_not_itself'
  ) then
    alter table batch_ingredients
      add constraint batch_ingredients_not_itself
      check (not (ref_type = 'batch' and ref_id = batch_id));
  end if;
end $$;

comment on column batch_ingredients.ref_type is
  '''inv'' for an ingredient off the shelf, ''batch'' for another batch — liquid butter inside marinated ji pai. Same shape meal_ingredients has used since 0001.';
comment on column batch_ingredients.ref_id is
  'An ingredients.id or a batches.id, per ref_type. No foreign key, exactly like meal_ingredients: the costing code reports a dangling ref rather than costing it at zero.';

-- The old column goes now that nothing needs it. Dropped rather than left
-- to rot: a second column meaning the same thing is a second thing to keep
-- in step, and nothing says which is right the day they disagree.
alter table batch_ingredients drop column if exists ingredient_id;

create index if not exists idx_batch_ingredients_ref
  on batch_ingredients(ref_type, ref_id);


-- ============================================================
-- Pricing a batch, now that a batch can contain one
--
-- `batch_cost_per_unit` from 0016 joined `batch_ingredients` to `ingredients`
-- on `ingredient_id` — the column this migration drops. Left alone it would
-- not merely lose the new lines: the join would fail outright, and this is
-- the function `consume_for_order` calls to price a batch at the moment of
-- sale. Every dish drawing on a batch would have booked ₱0 of cost.
--
-- So it is replaced here, in the same migration that breaks it, and made
-- recursive at the same time: the cost of ji pai per gram now depends on the
-- cost of liquid butter per gram.
--
-- `p_depth` is the cycle guard. A loop cannot be produced through this
-- system — the direct case is refused by a constraint, the transitive case by
-- `saveBatchRecipe` — but a row can still arrive from an import or a hand
-- edit, and a function that recurses for ever takes the whole shop's till
-- down rather than one screen. Ten is far deeper than any real prep chain and
-- shallow enough to stop instantly.
-- ============================================================
create or replace function batch_cost_per_unit(
  p_batch_id text,
  p_depth int default 0
)
returns numeric
language plpgsql
stable
as $$
declare
  v_manual numeric;
  v_yield numeric;
  v_total numeric := 0;
  line record;
begin
  if p_depth > 10 then
    -- A recipe loop. Zero rather than an exception: this is called from the
    -- middle of recording a sale, and refusing to sell noodles because a
    -- sauce recipe points at itself is worse than costing that sauce at
    -- nothing. The costing screens report the loop in words.
    return 0;
  end if;

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

  for line in
    select ref_type, ref_id, qty from batch_ingredients where batch_id = p_batch_id
  loop
    if line.ref_type = 'batch' then
      v_total := v_total + line.qty * batch_cost_per_unit(line.ref_id, p_depth + 1);
    else
      v_total := v_total + line.qty * coalesce(
        (select cost from ingredients where id = line.ref_id), 0
      );
    end if;
  end loop;

  return v_total / v_yield;
end;
$$;

-- The one-argument call sites in 0016 keep working through the default, but
-- the old one-argument FUNCTION still exists and would now shadow nothing
-- while quietly being the one PostgreSQL picks for `batch_cost_per_unit(x)`.
-- It has to go, or half the system would still be running the broken join.
drop function if exists batch_cost_per_unit(text);

do $$
begin
  execute 'revoke all on function batch_cost_per_unit(text, int) from public, anon, authenticated';
  execute 'grant execute on function batch_cost_per_unit(text, int) to service_role';
end $$;


-- ============================================================
-- Making a batch, now that a batch can contain one
--
-- Replaces the 0017 version. Two changes:
--
--   An 'inv' line consumes an ingredient, exactly as before.
--   A 'batch' line consumes another batch's `batch_stock`.
--
-- No recursion. Making ji pai draws down butter that already exists; it does
-- not make butter. Which is both the real kitchen behaviour and the reason
-- this function cannot be made to hang by a cycle in the recipes.
--
-- The sub-batch's cost per unit is worked out from what it last actually cost
-- to make, and falls back to its manual cost — the two things a repack or a
-- cooked batch respectively know about themselves. A sub-batch with neither
-- contributes zero to the cost and says so in the activity log rather than
-- silently making the parent look cheap.
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
  v_need numeric;
  v_have numeric;
  v_sub_name text;
  v_sub_cost numeric;
  line record;
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

  for line in
    select ref_type, ref_id, qty from batch_ingredients where batch_id = p_batch_id
  loop
    v_need := line.qty * p_multiplier;

    if line.ref_type = 'batch' then
      -- Locked before it is read: two people making batches at once must not
      -- both see the same butter and both take it. Same reasoning as 0016.
      select name, batch_stock, coalesce(manual_cost_per_unit, 0)
        into v_sub_name, v_have, v_sub_cost
        from batches where id = line.ref_id for update;

      if not found then
        raise exception 'This recipe uses a batch that no longer exists.';
      end if;
      if v_have < v_need then
        raise exception 'Not enough "%" — you need % and have %.',
          v_sub_name, v_need, v_have;
      end if;

      update batches
        set batch_stock = batch_stock - v_need
        where id = line.ref_id;

      v_cost := v_cost + (v_need * v_sub_cost);
    else
      v_cost := v_cost + consume_ingredient(
        line.ref_id, v_need, current_date, 'batch'
      );
    end if;

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
