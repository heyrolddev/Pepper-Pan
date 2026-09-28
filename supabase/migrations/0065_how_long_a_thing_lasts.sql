-- ============================================================
-- 0065 — the day it ran out
--
-- THE ASK
--
-- An 11kg LPG tank, a pack of tissue, a bottle of dishwashing liquid, a
-- box of receipt rolls, a mop. The shop buys them, they sit in the stall
-- for a while, and one day they are gone. Nobody knows in advance how
-- long that takes, and nobody can measure it per dish. What the owner
-- wants is to log the purchase, come back when it runs out and say so,
-- and be told from then on roughly how long one lasts.
--
-- WHERE IT GOES: `running_costs`, which is already exactly this
--
-- 0045 built this table for "paper towels, alcohol, batteries, a gas
-- refill, a wok repair" — things consumed and gone that no recipe uses.
-- Every item in the ask is one of those. A second table would split the
-- same receipt across two screens and the shop would have to remember
-- which of them a bottle of Joy went into.
--
-- WHAT WAS MISSING
--
-- Only gas had a lifespan, and it was INFERRED from the gap between one
-- refill and the next. That is a good estimate for something replaced the
-- day it dies, and a wrong one for everything else: buy three tanks at
-- once and it reads two of them as lasting no time at all; buy a spare in
-- advance and every future estimate is short. It also cannot tell "still
-- using it" from "ran out a month ago and nobody has bought more", which
-- is the one state worth a warning.
--
-- Two columns fix all of it, and they are the two the owner described.
--
-- ONE PURCHASE IS NOT ALWAYS ONE THING
--
-- `qty` matters more than it looks. Three tanks bought together and burned
-- one after another is one row and three lifespans; without the count the
-- average comes out three times too long, and a reorder warning built on
-- it fires two tanks too late.
-- ============================================================

/* How many of the thing this one purchase covers. Three tanks, a dozen
   rolls, one mop. Default 1, because that is what every row written before
   today meant. */
alter table running_costs
  add column if not exists qty numeric not null default 1;

/* The day the last of it was used up. NULL means it is still going — which
   is a real state and the one a reorder warning is about, not a missing
   value to be filled in later with a guess. */
alter table running_costs
  add column if not exists ran_out_on date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'running_costs_qty_positive') then
    alter table running_costs add constraint running_costs_qty_positive
      check (qty > 0);
  end if;
  /* Running out before it was bought is a typo, every time. Allowed to be
     the SAME day — something bought and finished in one service is a real
     thing, and refusing it would make the shop lie about the date to get
     the row saved. */
  if not exists (select 1 from pg_constraint where conname = 'running_costs_ran_out_after_bought') then
    alter table running_costs add constraint running_costs_ran_out_after_bought
      check (ran_out_on is null or ran_out_on >= spent_on);
  end if;
end $$;

comment on column running_costs.qty is
  'How many of the thing this purchase covers. Three tanks bought together '
  'are one row and three lifespans — without this the average comes out '
  'three times too long.';
comment on column running_costs.ran_out_on is
  'The day the last of it was used up, filled in afterwards. NULL means it '
  'is still in use: a real state, and the one a reorder warning is about.';

/* The open ones, which is what every reorder screen asks for first. */
create index if not exists idx_running_costs_open
  on running_costs(label, spent_on desc) where ran_out_on is null;
