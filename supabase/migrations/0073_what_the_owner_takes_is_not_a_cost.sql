/*
 * The owner taking their own pay is not the shop spending money.
 *
 * There was no right way to record it. Money left the drawer and the two
 * places it could be logged were both wrong in different directions:
 *
 *   Record a spend → running_costs, and into break-even and net profit.
 *     A draw counted as an operating cost makes profit read lower than it
 *     is, pushes break-even up, and — worst — makes "the shop is losing
 *     money" and "I took money out" look identical on every screen.
 *
 *   Money out → cash_ledger, and into nothing.
 *     Correct arithmetic, no meaning. The pot goes down and nothing says
 *     the pesos were wages, so nothing can say how much of this month's
 *     wages are left.
 *
 * And a shop that budgets "Owner's salary ₱15,000" as a fixed cost has
 * ALREADY counted that money once, in break-even. Logging each draw as a
 * spend on top of it counts the same wage twice.
 *
 * ── Where a draw lives ───────────────────────────────────────────────────
 *
 * In `cash_ledger`, as an `out` line with `category = 'draw'`. Not a new
 * table, on purpose: a draw IS a movement of a pot and nothing else, and a
 * second table holding the same peso is a second thing to keep in step. The
 * balances already count every ledger line; net profit and break-even
 * already read none of them. So the arithmetic is right the moment the row
 * exists, with no change to a single sum.
 *
 * Staff can read `cash_ledger` and that stays true, which looks like an
 * oversight and is not: a draw taken mid-shift leaves the drawer, and the
 * person counting that drawer at the end of the shift has to see it or come
 * up short and be asked why. It reads as "Owner's pay", which is what it is.
 *
 * ── What this migration actually adds ────────────────────────────────────
 *
 * One flag. Which of the fixed costs IS the owner's pay, so the screen can
 * say "₱13,000 of ₱15,000 left" instead of only "you have taken ₱2,000".
 * The budget already exists; nothing knew which row it was.
 */

alter table fixed_costs
  add column if not exists is_owner_pay boolean not null default false;

comment on column fixed_costs.is_owner_pay is
  'Marks the one standing cost that is the owner''s own pay. Draws from '
  'cash_ledger (category = ''draw'') are measured against it.';

/*
 * At most one, enforced rather than asked for.
 *
 * Two rows flagged would give two budgets and no answer to "how much is
 * left" — and the screen would have to pick one, silently. A partial unique
 * index makes the second tick fail at the database instead.
 */
create unique index if not exists fixed_costs_one_owner_pay
  on fixed_costs ((is_owner_pay))
  where is_owner_pay;

-- ---------------------------------------------------------------
-- Behaviour checks
-- ---------------------------------------------------------------

do $$
declare
  v_a text;
  v_b text;
begin
  insert into fixed_costs (label, amount, is_owner_pay)
  values ('ZZ Test rent', 8000, false) returning id into v_a;
  insert into fixed_costs (label, amount, is_owner_pay)
  values ('ZZ Test owner pay', 15000, true) returning id into v_b;

  -- A second one must be refused, not silently accepted.
  begin
    insert into fixed_costs (label, amount, is_owner_pay)
    values ('ZZ Test second pay', 9000, true);
    raise exception 'FAIL: two fixed costs were both flagged as the owner''s pay';
  exception
    when unique_violation then null;
  end;

  -- Moving the flag must work, or the owner can never change their mind.
  update fixed_costs set is_owner_pay = false where id = v_b;
  update fixed_costs set is_owner_pay = true where id = v_a;
  if (select count(*) from fixed_costs where is_owner_pay) <> 1 then
    raise exception 'FAIL: the flag could not be moved between rows';
  end if;

  delete from fixed_costs where label like 'ZZ Test%';
  raise notice 'OK: exactly one fixed cost can be the owner''s pay, and it can move';
end $$;

do $$
declare
  v_before numeric;
  v_after numeric;
begin
  /* A draw moves the pot and nothing else.

     This is the whole claim of the feature, so it is checked rather than
     asserted in a comment: the ledger sum changes by the draw, and the
     tables every cost figure is built from do not gain a row. */
  select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
    into v_before from cash_ledger where account = 'cash';

  insert into cash_ledger (date, type, amount, account, category, note)
  values (current_date, 'out', 2000, 'cash', 'draw', 'ZZ Test owner pay');

  select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
    into v_after from cash_ledger where account = 'cash';

  if v_after <> v_before - 2000 then
    raise exception 'FAIL: a draw did not move the drawer (% -> %)', v_before, v_after;
  end if;

  if exists (select 1 from running_costs where label like 'ZZ Test%') then
    raise exception 'FAIL: a draw reached running_costs, so it would be counted as a cost';
  end if;

  if exists (select 1 from fixed_costs where label like 'ZZ Test%') then
    raise exception 'FAIL: a draw reached fixed_costs';
  end if;

  delete from cash_ledger where note like 'ZZ Test%';
  raise notice 'OK: a draw moves the pot and never becomes a cost';
end $$;
