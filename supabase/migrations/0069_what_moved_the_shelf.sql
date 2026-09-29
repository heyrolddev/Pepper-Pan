-- ============================================================
-- 0069 — an ingredient's history, from what actually moved it
--
-- WHAT WAS REPORTED
--
-- "sa history for ingredients sa inventory, parang hindi gumagana, and
--  dapat hindi lang sa batch kundi pati if magagamit sila sa kahit saan,
--  if sa order online or sa counter man"
--
-- Correct on both counts, and the reason is the same one.
--
-- WHAT IT WAS DOING
--
-- `ingredientHistory` searched the ACTIVITY LOG for the ingredient's
-- NAME. Three things follow from that, and all three are bad:
--
--   A sale writes no activity line naming an ingredient. It writes to
--   `consumption_log`, which the history never read. So every order —
--   online and at the counter — was invisible, which is exactly what the
--   shop noticed.
--
--   Renaming an ingredient erased its entire history, because the search
--   is the name.
--
--   "Pork" matched "Pork Belly", "Ground Pork" and "BP Pork Batch". A
--   history that shows another ingredient's movements is worse than an
--   empty one: an empty one is obviously empty.
--
-- WHAT IT DOES NOW
--
-- Reads the ledgers that actually record movement, by id: the purchase
-- log for what came in, the consumption log for everything that took it
-- out, and the waste log for what was thrown away. Those are written by
-- every path — a sale, a counter sale, a batch, a staff meal, a count —
-- because they are what `consume_ingredient` and `recordRestock` write.
--
-- THE SHORT DESCRIPTION
--
-- `consumption_log` recorded a quantity and a one-word type, so the best
-- it could say was "sale". Two columns fix that: a note, written at the
-- moment the stock moved by the thing that moved it, and a timestamp so
-- rows on the same day can be read back in the order they happened —
-- the same tie-breaker `cash_ledger` got in 0045, and for the same
-- reason.
--
-- `consume_ingredient` therefore takes a note. Added as a fifth
-- parameter WITH A DEFAULT, so every existing four-argument call keeps
-- resolving and nothing that already works has to change. Its three
-- callers are re-created below to pass something worth reading: the
-- ticket number for a sale, the batch for a production run, the dish for
-- a staff meal.
-- ============================================================

/* Written at the moment the stock moved, by the thing that moved it. A
   description worked out afterwards from a type and a date is a guess, and
   guesses are what this history is replacing. */
alter table consumption_log add column if not exists note text;

/* A TIE-BREAKER for reading order within a day, never the accounting day —
   that is still `date`. clock_timestamp() rather than now(), so the four
   ingredients one sale takes off do not all tie. Rows written before today
   carry migration time, so their relative order is arbitrary but stable. */
alter table consumption_log
  add column if not exists created_at timestamptz not null default clock_timestamp();

comment on column consumption_log.note is
  'What moved it, in the shop''s own words — "Sold — ticket #142", "Used '
  'making BP M.Chicken". Null on every row written before 0069, which is '
  'shown as the type rather than as a blank.';

create index if not exists idx_consumption_log_ingredient_at
  on consumption_log(ingredient_id, date desc, created_at desc);

-- ------------------------------------------------------------
-- The note, and where it comes from when nobody passes one
-- ------------------------------------------------------------
create or replace function consume_ingredient(
  p_ingredient_id text,
  p_qty numeric,
  p_date date,
  p_type text,
  /* Fifth, and defaulted, so all three existing four-argument callers keep
     resolving unchanged. A caller that knows what it is doing says so; one
     that does not gets a sentence derived from the type below, which still
     beats the bare word the history used to show. */
  p_note text default null
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
  v_note text;
  lot record;
begin
  if p_qty is null or p_qty <= 0 then
    return 0;
  end if;

  v_note := coalesce(nullif(btrim(p_note), ''), case p_type
    when 'sale'     then 'Sold'
    when 'batch'    then 'Used making a batch'
    when 'internal' then 'Staff meal or internal use'
    when 'waste'    then 'Thrown away'
    when 'count'    then 'Stock count correction'
    else 'Used'
  end);

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

  insert into consumption_log (ingredient_id, date, qty, type, note)
  values (p_ingredient_id, p_date, p_qty, p_type, v_note);

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
      '. More was used than the shelf had — either a delivery was not ' ||
      'logged, or the count was wrong.'
    );
  end if;

  return v_cost;
end;
$$;

-- ------------------------------------------------------------
-- The three callers, each saying what it was
--
-- Re-created from their own current source with one change apiece, so the
-- stock arithmetic that every peso in this system rests on is byte-for-byte
-- what it was this morning.
-- ------------------------------------------------------------
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
      v_cogs := v_cogs + consume_ingredient(
        req.ref_id, req.qty, v_date, 'sale',
        /* The line the shelf reads back later. A ticket number is what
           somebody standing at the counter can actually match against a
           receipt; 'sale' on its own says only that it was not waste. */
        'Sold — ticket #' || coalesce(v_ticket::text, '?')
      );
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
  /* The batch being made, for the line each ingredient writes to its own
     history. Read with the yield below rather than looked up again. */
  v_name text;
  v_sub_cost numeric;
  line record;
begin
  if p_multiplier is null or p_multiplier <= 0 then
    raise exception 'How many batches? Must be more than zero.';
  end if;

  select yield_qty, manual_cost_per_unit, name into v_yield, v_manual, v_name
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
        line.ref_id, v_need, shop_date(), 'batch',
        'Used making ' || coalesce(v_name, 'a batch')
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
  /* The dish, so an ingredient's history says what ate it rather than just
     'internal'. */
  v_name text;
  req record;
begin
  if p_qty is null or p_qty <= 0 then return 0; end if;

  select name into v_name from meals where id = p_meal_id;

  for req in select * from meal_requirements(p_meal_id, p_qty) loop
    if req.ref_type = 'inv' then
      /* Through `consume_ingredient`, not a bare UPDATE, so a wasted dish
         takes the same lots in the same order a sold one does — first to
         expire, first out — and lands in `consumption_log` where the usage
         averages and the reorder list read from. A staff meal that skipped
         the log would quietly make every reorder suggestion too small. */
      v_cogs := v_cogs + coalesce(
        consume_ingredient(req.ref_id, req.qty, p_date, p_type,
                           /* Which dish AND what happened to it. The dish
                              name alone reads as a label rather than an
                              event — the shelf wants to know whether it was
                              eaten by staff or scraped into a bin. */
                           case p_type
                             when 'internal' then 'Staff meal — '
                             when 'waste' then 'Thrown away — '
                             else 'Used for '
                           end || coalesce(v_name, 'a dish')), 0
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

/* The grants these functions had. Re-creating a function keeps its grants,
   but `consume_ingredient` gained a parameter and is therefore a NEW
   function with none — and the app calls it through the service role. */
do $$
begin
  /* REVOKE FIRST, and this is not housekeeping.
  
     Postgres grants EXECUTE on a new function to PUBLIC. `consume_ingredient`
     gained a parameter here, which makes it a NEW function — so the revoke
     0016 and 0053 did applies to a signature that no longer exists, and the
     replacement arrived with the anon key able to take food off the shelf by
     calling it directly. Caught by the behaviour check that has guarded this
     since 0053, which is exactly what that check is for. */
  execute 'revoke all on function consume_ingredient(text, numeric, date, text, text) from public, anon, authenticated';
  execute 'grant execute on function consume_ingredient(text, numeric, date, text, text) to service_role';
  execute 'grant execute on function apply_order_stock(text) to service_role';
  execute 'grant execute on function produce_batch(text, numeric) to service_role';
  execute 'grant execute on function consume_meal(text, numeric, date, text) to service_role';
end $$;

/* And the old four-argument version is dropped, so there is exactly one.
   Leaving both would make every existing call ambiguous the moment anyone
   passed four arguments — Postgres cannot choose between a four-parameter
   function and a five-parameter one with a default. */
drop function if exists consume_ingredient(text, numeric, date, text);
