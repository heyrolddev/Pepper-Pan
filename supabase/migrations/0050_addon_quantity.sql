-- ============================================================
-- 0050 — How many of the add-on?
--
-- "Dapat malaya si customer kung ilan gusto nya." Two extra rice with a
-- Bagnet Rice is an ordinary order at any carinderia in the country, and
-- until now the only way to ring it up was two separate lines of the whole
-- rice meal — which charges for two rice meals.
--
-- WHY THE ORDER SIDE NEEDS NOTHING
--
-- `order_line_extras.qty` has existed since 0049, and `order_requirements`
-- has multiplied by it from the day it was written:
--
--     select e.meal_id, (e.qty * ol.qty)::numeric ...
--
-- So the stock, the costing and the cancellation path already handle two
-- portions of rice correctly. Everything above them wrote 1 into that column
-- and never offered a way to write anything else. This adds the one thing
-- that was actually missing: permission, per option, to ask for more.
--
-- WHY PER OPTION AND NOT PER GROUP
--
-- Because the answer differs inside one group. "Extra rice" can sensibly be
-- taken twice; "upgrade to large" cannot be taken twice, and a group holding
-- both would have to be split in two to say so. The option is where the
-- dish is named, so it is where "how many of that dish" belongs.
--
-- WHY IT IS NOT max_select
--
-- `max_select` counts DISTINCT answers — "pick up to 2 sauces". `max_qty`
-- counts copies of ONE answer — "up to 3 extra rice". A group can be pick-one
-- and still let the customer take three of what they picked; conflating the
-- two would make "one drink" and "one bottle of that drink" the same setting.
-- ============================================================

alter table modifier_options
  add column if not exists max_qty int not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'modifier_options_max_qty_range'
  ) then
    /* 1 is "tick it or don't", which is what every existing option is and
       what most of them should stay. 20 is a ceiling rather than a policy:
       a stepper is not how anybody orders twenty of something, and a typo in
       the editor should not be able to commit the kitchen to it. */
    alter table modifier_options add constraint modifier_options_max_qty_range
      check (max_qty >= 1 and max_qty <= 20);
  end if;
end $$;

comment on column modifier_options.max_qty is
  'How many of this one the customer may take. 1 is a tick; more is a stepper. Distinct from modifier_groups.max_select, which counts different answers rather than copies of one.';

/* A belt-and-braces bound on what actually gets sold. The app clamps to the
   option''s own `max_qty`, but that column can be lowered after an order was
   placed, and this check only has to stop the impossible: a line for zero,
   or a fractional portion of a drink. */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_line_extras_qty_whole'
  ) then
    alter table order_line_extras add constraint order_line_extras_qty_whole
      check (qty = trunc(qty) and qty >= 1 and qty <= 20);
  end if;
end $$;
