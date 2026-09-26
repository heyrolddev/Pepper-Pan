-- ============================================================
-- The shop's day is Apalit's day, not the server's
--
-- Every `date` column in this schema takes `current_date`, and a Supabase
-- project runs in UTC. Manila is UTC+8. So the day a row is filed under has
-- always rolled over at 8am local — and for those eight hours every morning,
-- the database and the calendar on the wall disagreed about what day it was.
--
-- It surfaced on a Sunday. HQ read:
--
--     SUNDAY, 27 SEPTEMBER
--     ₱2,061 · 8 orders today
--
-- Those eight orders were Saturday's. Sunday had not opened. The heading was
-- formatted in Manila and the figure was filtered in UTC, so the two halves
-- of one sentence were eight hours apart and neither of them said so.
--
-- The application half is fixed in `lib/format-date.ts`. This is the other
-- half, and both are needed: fix only the reading and a sale rung up at half
-- past midnight is stored under yesterday while HQ counts it in today, which
-- is the same drift pointing the other way. Fix only the writing and every
-- screen still asks the wrong question for eight hours.
--
-- ── Nothing is backfilled, and that is deliberate ────────────────────────
--
-- A row already written carries the UTC day it was written under. For a
-- stall that trades in daylight those are the same date — Manila 08:00 to
-- 23:59 maps to UTC 00:00 to 15:59 on the same day — so there is nothing to
-- correct for the overwhelming majority of them. What might differ is a row
-- written between midnight and 8am Manila, and moving one of those means
-- deciding, from here, which day somebody meant. Rewriting history on a
-- guess is worse than leaving a handful of rows where they are, and the
-- owner can move a genuinely misfiled day themselves.
-- ============================================================

-- ------------------------------------------------------------
-- One function, so this can never be half-applied again
--
-- Eleven columns had this default written out eleven times, which is how
-- they all got it wrong together and how the next one would too. A table
-- added next year gets the shop's day by writing `shop_date()`, and anything
-- auditing for `current_date` has one thing to look for.
--
-- STABLE, not IMMUTABLE: it reads the clock. Marking it immutable would let
-- the planner fold it to a constant, which for a function whose whole job is
-- to change once a day is a very quiet way to freeze the shop in time.
-- ------------------------------------------------------------
create or replace function shop_date() returns date
language sql stable as
$$ select (now() at time zone 'Asia/Manila')::date $$;

comment on function shop_date() is
  'Today, as the calendar in Apalit has it. Every date column defaults to '
  'this rather than current_date, which is UTC and therefore eight hours '
  'behind the shop every morning.';

-- ------------------------------------------------------------
-- Every column that files a row under a day
-- ------------------------------------------------------------
alter table orders          alter column date        set default shop_date();
alter table purchase_log    alter column date        set default shop_date();
alter table consumption_log alter column date        set default shop_date();
alter table waste_log       alter column date        set default shop_date();
alter table cash_ledger     alter column date        set default shop_date();
alter table receivables     alter column date        set default shop_date();
alter table cycle_counts    alter column date        set default shop_date();
alter table activity_log    alter column date        set default shop_date();

alter table marketing_campaigns alter column started_on  set default shop_date();
alter table supplier_debts      alter column incurred_on set default shop_date();
alter table running_costs       alter column spent_on    set default shop_date();

comment on column orders.date is
  'The trading day this sale belongs to, in Manila. Defaults to shop_date() '
  'since 0059 — before that it was current_date, which rolled over at 8am '
  'local and filed the small hours under the day before.';

-- ------------------------------------------------------------
-- And the one place a day is written by hand
--
-- `produce_batch` passes the date into `consume_ingredient` itself rather
-- than letting the column default do it, so changing the default above does
-- not reach it: a batch prepped at half past six in the morning — which is
-- when batches actually get prepped — would still be logged under yesterday.
-- Usage averages and the reorder list are built on that log.
--
-- Copied from 0046 with one token changed, which is what `create or replace`
-- means in an append-only migration folder and what 0046 itself did to 0017.
-- This is now the live definition; the copy in 0046 is history.
-- ------------------------------------------------------------
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
        line.ref_id, v_need, shop_date(), 'batch'
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
