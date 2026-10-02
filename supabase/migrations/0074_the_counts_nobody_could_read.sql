/*
 * An index for a table that finally has a reader.
 *
 * `cycle_counts` has been written on every recount since 0001 — what the
 * system believed was on the shelf, what was actually there, the difference,
 * and the difference in pesos. Searched across the whole repository it had
 * one insert, two deletes in Reset, and a line each in backup and restore.
 *
 * Nothing read it. Not one screen, in seventy-three migrations.
 *
 * So the shop's entire record of stock going missing — its best evidence of
 * theft, of portions heavier than the recipe, of waste nobody logged — piled
 * up somewhere no one could look.
 *
 * ── Why the index was never needed before ────────────────────────────────
 *
 * Because nothing queried it. A table that is only ever inserted into needs
 * no index at all, and this one correctly had none. The new screen reads it
 * by date range, so now it does.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 *
 * The money. Shrinkage reaches no cost figure in this system:
 *
 *   netProfit      = grossProfit − fixedCosts − waste − runningCosts
 *   breakEvenDaily = (fixedCosts + waste + runningCosts) / margin / openDays
 *
 * Neither has a shrinkage term, and `consumption_log` appears in no money
 * module at all. Buy ₱1,000 of pork, sell ₱900 of it, and the missing ₱100
 * is not sold, not waste, and not booked: the count corrects the shelf and
 * the pesos leave the story, so profit reads high by exactly that much.
 *
 * Fixing that moves figures the owner already plans around, and it should
 * not move them by a surprise amount on a Tuesday. The screen lands first so
 * the size is known; the accounting follows as its own change, on purpose.
 */

/*
 * Date first, because every query this table now serves is a range over days
 * and then a read of the payload. A plain btree on `date` is the whole of
 * what is wanted: the jsonb is never filtered on, only returned.
 */
create index if not exists cycle_counts_date_idx
  on cycle_counts (date desc);

-- ---------------------------------------------------------------
-- Behaviour checks
-- ---------------------------------------------------------------

do $$
declare
  v_rows int;
begin
  /* The shape the reader depends on, pinned here.

     Nothing has ever read this payload, which means nothing has ever found
     out whether it is written the way the writer believes. If a later edit
     renames a key, the screen quietly shows zero shrinkage for ever — the
     most dangerous failure this feature can have, because an empty leak
     report looks exactly like no leak. */
  insert into cycle_counts (date, payload) values
    (current_date, jsonb_build_object(
      'ingredientId', 'zz-test',
      'name', 'ZZ Test Pork',
      'systemQty', 10,
      'countedQty', 8,
      'variance', -2,
      'valueImpact', -428.24,
      'note', 'behaviour check'
    ));

  select count(*) into v_rows
    from cycle_counts
   where payload ->> 'name' = 'ZZ Test Pork'
     and (payload ->> 'variance')::numeric = -2
     and (payload ->> 'valueImpact')::numeric = -428.24
     and (payload ->> 'systemQty')::numeric = 10
     and (payload ->> 'countedQty')::numeric = 8;

  if v_rows <> 1 then
    raise exception
      'FAIL: the cycle_counts payload no longer carries name/variance/valueImpact/systemQty/countedQty — the stock accuracy screen reads these by name and would silently report no shrinkage';
  end if;

  delete from cycle_counts where payload ->> 'name' = 'ZZ Test Pork';
  raise notice 'OK: the cycle_counts payload still carries every key the reader needs';
end $$;

do $$
begin
  /* The index itself, checked by name.
 
     A check that merely runs `analyze` and declares success proves nothing;
     this one fails if the index was never created, was dropped, or was built
     on the wrong column. */
  if not exists (
    select 1 from pg_indexes
     where tablename = 'cycle_counts'
       and indexname = 'cycle_counts_date_idx'
  ) then
    raise exception 'FAIL: cycle_counts_date_idx is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
     where indexname = 'cycle_counts_date_idx'
       and indexdef ilike '%(date%'
  ) then
    raise exception 'FAIL: cycle_counts_date_idx is not on the date column';
  end if;

  raise notice 'OK: cycle_counts is indexed by date';
end $$;
