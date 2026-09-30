/*
 * Eight shelves that were adding up fine.
 *
 * The owner opened Inventory and read, in orange, across the top of the page:
 *
 *     8 shelves stopped adding up today
 *     More was sold than the shop had recorded as made.
 *
 * Underneath it, eight rows. Every one of them was ordinary work:
 *
 *     Made 2x "Marinated Pork (1kg)" - 24 serving, cost P428.24
 *     Counted "1D Bento": 14 -> 37 pc (+23.00)
 *     Counted "RASPBERRY P.": 390 -> 370 g (-20.00)
 *
 * Nothing had gone below zero. Nothing was short. The shop had made two
 * batches and counted six shelves, and the software called each one a failure.
 *
 * ── How ──────────────────────────────────────────────────────────────────
 *
 * `activity_log.category = 'movement'` had two authors. 0053, 0060 and 0069
 * write it when a shelf crosses below zero or a sale comes off no shelf at
 * all — real trouble, with the remedy spelled out in the message. The
 * inventory screen ALSO wrote it, for every batch produced and every cycle
 * count entered — the most routine thing that screen does.
 *
 * `listShelfAlerts()` can only filter by category. So it swept up both.
 *
 * The collision was known. The comment on ACTIVITY_CATEGORIES said, in as
 * many words, "the database now writes to it too when a shelf goes below
 * zero" — and the alert was built on that category regardless. Writing a
 * hazard down is not the same as removing it.
 *
 * ── The cruel part ───────────────────────────────────────────────────────
 *
 * The banner's own advice is "Recount it below". A recount wrote another
 * 'movement' row. The alert therefore counted UP each time somebody did what
 * it asked, and the only way to make it quiet was to stop working.
 *
 * ── The fix, and why it is shaped this way ───────────────────────────────
 *
 * The application now files batches and counts under `inventory`, beside
 * "Edited ingredient", where they always belonged. `movement` becomes the
 * database's alone and its label changes from "Stock moved" to "Shelf short"
 * to match.
 *
 * Nothing here re-creates the three logging functions, and that is deliberate.
 * Changing the category they write would mean reproducing three long plpgsql
 * bodies to alter one string literal in each — the kind of edit that silently
 * drops a branch. The writer that was wrong is the one that moved.
 *
 * This migration is the backfill: rows already in the table, misfiled by the
 * old code, sorted into the two categories by the only thing that can tell
 * them apart now — the words the writer used.
 */

-- ---------------------------------------------------------------
-- Backfill
--
-- Conservative on purpose, and in the direction that errs toward noise
-- rather than silence: a row is moved out of `movement` only when it clearly
-- matches something the APPLICATION wrote. Anything unrecognised stays where
-- it is, so an alert that should fire still fires. A missed warning is worse
-- than one extra row.
--
-- The two shapes the inventory screen wrote, and nothing else:
--     Made 2x "Marinated Pork (1kg)" - 24 serving, cost P428.24
--     Counted "1D Bento": 14 -> 37 pc (+23.00)
-- ---------------------------------------------------------------

update activity_log
   set category = 'inventory'
 where category = 'movement'
   and (description like 'Made %' or description like 'Counted %')
   -- Belt and braces: never move a row that carries any of the database's
   -- three warning phrases, whatever it happens to start with.
   and description not like '%went below zero: short by %'
   and description not like '%took nothing off the shelf:%'
   and description not like 'Nothing came off the shelf for %';

-- ---------------------------------------------------------------
-- Behaviour checks
--
-- Run against a real Postgres. Each one fails loudly rather than returning a
-- row nobody reads.
-- ---------------------------------------------------------------

do $$
declare
  v_moved int;
  v_kept int;
begin
  -- A batch and a count, as the old code wrote them.
  insert into activity_log (date, category, description) values
    (current_date, 'movement', 'Made 3x "Test Batch" - 9 serving, cost P100.00'),
    (current_date, 'movement', 'Counted "Test Shelf": 10 -> 4 pc (-6.00)');

  -- A genuine warning, as the database writes it.
  insert into activity_log (date, category, description) values
    (current_date, 'movement',
     'Test Shelf went below zero: short by 2 pc. More was used than the shelf had.');

  -- Re-run the same statement the backfill above ran.
  update activity_log
     set category = 'inventory'
   where category = 'movement'
     and (description like 'Made %' or description like 'Counted %')
     and description not like '%went below zero: short by %'
     and description not like '%took nothing off the shelf:%'
     and description not like 'Nothing came off the shelf for %';

  select count(*) into v_moved
    from activity_log
   where category = 'inventory'
     and description like '%Test %';

  if v_moved <> 2 then
    raise exception 'FAIL: expected the batch and the count to move, moved %', v_moved;
  end if;

  select count(*) into v_kept
    from activity_log
   where category = 'movement'
     and description like 'Test Shelf went below zero%';

  if v_kept <> 1 then
    raise exception 'FAIL: a real below-zero warning was moved out of the alert';
  end if;

  delete from activity_log where description like '%Test Batch%'
     or description like '%Test Shelf%';

  raise notice 'OK: batches and counts filed as inventory, shortfalls left alerting';
end $$;

-- A count that merely MENTIONS the phrase must not be dragged out of the
-- alert by the `like 'Counted %'` arm. The order of the conditions is what
-- makes this true, and an order is exactly the kind of thing a later edit
-- reverses without noticing.
do $$
declare
  v_cat text;
begin
  insert into activity_log (date, category, description)
  values (current_date, 'movement',
          'Counted "Odd Shelf" went below zero: short by 1 pc after the count');

  update activity_log
     set category = 'inventory'
   where category = 'movement'
     and (description like 'Made %' or description like 'Counted %')
     and description not like '%went below zero: short by %'
     and description not like '%took nothing off the shelf:%'
     and description not like 'Nothing came off the shelf for %';

  select category into v_cat
    from activity_log
   where description like 'Counted "Odd Shelf"%'
   limit 1;

  if v_cat <> 'movement' then
    raise exception 'FAIL: a warning starting with "Counted" was filed away as routine';
  end if;

  delete from activity_log where description like 'Counted "Odd Shelf"%';
  raise notice 'OK: the warning phrases win over the opening word';
end $$;
