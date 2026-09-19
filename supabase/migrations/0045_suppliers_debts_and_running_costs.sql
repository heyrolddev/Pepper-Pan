-- ============================================================
-- 0045 — Who you buy from, what you owe them, and what the shop
--        quietly spends that nothing has ever counted
--
-- FOUR THINGS, ONE CAUSE
--
-- 1. THE DRAWER HISTORY IS IN THE WRONG ORDER. `cash_ledger.date` is a DATE.
--    Every line written on the same day therefore ties in the sort, and a
--    stable sort keeps them in the order they were assembled: hand-typed rows
--    first, sales second. So a restock entered at 7am and a sale rung up at
--    6pm appear in that order regardless of which actually happened last, and
--    the owner reads the history as a sequence that never occurred. There is
--    no way to fix this in code — the information is not in the table.
--
-- 2. "NOT YET PAID" RECORDS NOTHING. `recordRestock` skips the whole ledger
--    block when `paidFrom` is 'unpaid'. The stock arrives, `purchase_log`
--    keeps the peso figure, and no debt is written anywhere at all. The shop's
--    money therefore reads high by everything it has ever bought on utang, and
--    there is no list of who is owed. The money screen's "utang" is the other
--    direction entirely — customers who owe Pepper Pan.
--
-- 3. SUPPLIER NAMES ARE RETYPED EVERY DELIVERY. `purchase_log.supplier` is
--    free text with no table behind it, so "Aling Nena", "aling nena" and
--    "Nena" are three suppliers, and nobody can answer "what do I buy from
--    her and how do I ring her".
--
-- 4. THE SHOP SPENDS MONEY NOTHING COUNTS. Paper towels, alcohol, batteries,
--    a gas refill, a repair. Not an ingredient, not rent, not an asset — and
--    so absent from break-even, which is computed from `fixed_costs` and
--    waste alone. The shop is told it needs less a day than it actually does,
--    every day, and the error is invisible because the sum is self-consistent.
--
-- The cause behind 2, 3 and 4 is the same: buying things has only ever been
-- modelled as buying INGREDIENTS. Everything else the shop pays for had
-- nowhere to go.
-- ============================================================


-- ============================================================
-- 1. The drawer history, in the order things actually happened
--
-- `date` stays as it is: it is what every balance is computed from, and the
-- start-date comparisons all rely on it being a date. `created_at` is only
-- ever a tie-breaker — the reading order within a day, never the accounting
-- day itself. Rows written before this migration all take migration time,
-- which leaves their relative order arbitrary but stable; nothing in the
-- table knows what time they were written, and inventing one would be worse
-- than admitting it.
-- ============================================================
--
-- `clock_timestamp()` and not `now()`: `now()` is TRANSACTION time and is
-- identical for every row written in the same transaction, which would leave
-- two lines from one operation tied all over again — exactly the bug being
-- fixed. Caught by the behaviour check below, which wrote two rows in one DO
-- block and got the old order back.
alter table cash_ledger
  add column if not exists created_at timestamptz not null default clock_timestamp();

comment on column cash_ledger.created_at is
  'When the line was written. A TIE-BREAKER for reading order within a day, never the accounting day — that is still `date`. clock_timestamp() rather than now(), so two rows written in one transaction do not tie. Rows from before 0045 all carry migration time, so their relative order is arbitrary but stable.';

create index if not exists idx_cash_ledger_date_created
  on cash_ledger(date desc, created_at desc);


-- ============================================================
-- 2. Who the shop buys from
--
-- A table rather than free text, so a name is picked and not retyped — three
-- spellings of one supplier is three suppliers to every report that groups by
-- it. `purchase_log.supplier` keeps its text: it is what was written at the
-- time and rewriting history to match a table made later would be a lie about
-- what the record said.
-- ============================================================
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  /* How to reach them, in the form somebody would actually use standing in
     front of an empty shelf. */
  phone text,
  place text,
  /* What the shop buys here, in the owner's words. Free text on purpose: a
     link to `ingredients` would be wrong the moment a supplier sells
     something that is not an ingredient — gas, bags, a repair. */
  sells text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table suppliers is
  'Who the shop buys from. Picked rather than retyped, so one supplier is one row and not three spellings.';

create index if not exists idx_suppliers_active on suppliers(active, name);

alter table suppliers enable row level security;

/* The shift restocks, so the shift needs the list. */
drop policy if exists "staff_read_suppliers" on suppliers;
create policy "staff_read_suppliers" on suppliers for select using (is_staff());

drop policy if exists "manager_write_suppliers" on suppliers;
create policy "manager_write_suppliers" on suppliers
  for all using (is_manager()) with check (is_manager());

/* The link, added alongside the text rather than replacing it. */
alter table purchase_log
  add column if not exists supplier_id uuid references suppliers(id) on delete set null;


-- ============================================================
-- 3. What the shop owes
--
-- The missing half of "not yet paid". A delivery taken on utang moves stock
-- without moving money — correctly — but the obligation was then recorded
-- nowhere, so the shop's balance counted pesos it had already spent.
--
-- WHY THE MONEY LEAVES AT PAYMENT AND NOT AT DELIVERY
--
-- Because it does. The cash is still in the drawer until the supplier is
-- paid; writing a ledger line on delivery would make the drawer fail a
-- physical count, and that count is the one self-correcting check on the
-- money screen. So this table carries the debt, and settling it is what
-- writes the `cash_ledger` line — on the day it is actually settled, out of
-- the pot it actually came from.
--
-- `paid` accumulates rather than the row flipping to settled, because a part
-- payment is the normal case with a supplier and "₱800 of ₱2,100" is a fact
-- the shop needs to be able to see.
-- ============================================================
create table if not exists supplier_debts (
  id uuid primary key default gen_random_uuid(),

  supplier_id uuid references suppliers(id) on delete set null,
  /* The name as it was at the time, frozen the way `orders.cogs` is frozen.
     A supplier renamed or deleted later must not silently relabel a debt the
     shop already settled. */
  supplier_name text,

  /* What it was for, in words. "12kg chicken", "22kg gas", "wok repair". */
  description text not null,
  amount numeric(12, 2) not null,
  paid numeric(12, 2) not null default 0,

  incurred_on date not null default current_date,
  /* 'restock' | 'spend' | 'manual' — where the debt came from, so a screen
     can say "this is a delivery" without joining three tables. */
  source text not null default 'manual',

  note text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_debts_amount_positive') then
    alter table supplier_debts add constraint supplier_debts_amount_positive
      check (amount > 0);
  end if;
  /* Nobody can pay more than they owe, and nobody can pay a negative amount
     back to themselves. Enforced here as well as in the form, because the
     form is one way in. */
  if not exists (select 1 from pg_constraint where conname = 'supplier_debts_paid_fits') then
    alter table supplier_debts add constraint supplier_debts_paid_fits
      check (paid >= 0 and paid <= amount);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'supplier_debts_source_known') then
    alter table supplier_debts add constraint supplier_debts_source_known
      check (source in ('restock', 'spend', 'manual'));
  end if;
end $$;

comment on table supplier_debts is
  'What Pepper Pan owes its suppliers. The opposite direction to `receivables`. No money moves when a row is created — the cash is still in the drawer; settling it is what writes the cash_ledger line.';
comment on column supplier_debts.paid is
  'Accumulates. A part payment is the normal case with a supplier, and "800 of 2,100" is a fact the shop needs to see rather than a boolean.';

/* Every screen reads the unsettled ones first, newest last-incurred first. */
create index if not exists idx_supplier_debts_open
  on supplier_debts(incurred_on desc) where paid < amount;

alter table supplier_debts enable row level security;

/* What the shop owes is the owner's and the manager's business, not the
   shift's — the same line drawn around fixed costs and the margin. */
drop policy if exists "manager_read_supplier_debts" on supplier_debts;
create policy "manager_read_supplier_debts" on supplier_debts
  for select using (is_manager());

drop policy if exists "manager_write_supplier_debts" on supplier_debts;
create policy "manager_write_supplier_debts" on supplier_debts
  for all using (is_manager()) with check (is_manager());


-- ============================================================
-- 4. What the shop spends that nothing counts
--
-- Paper towels, alcohol, batteries, a gas refill, a wok repair. Consumed and
-- gone: not an ingredient (no recipe uses them), not a fixed cost (they are
-- not the same every month), not an asset (nothing is left afterwards).
--
-- WHY GAS LIVES HERE AND NOT IN INVENTORY
--
-- It was the obvious candidate for an ingredient — it has a quantity and it
-- runs out. But an ingredient earns its place by being consumed in a MEASURED
-- amount per dish, and nobody can weigh the gas that went into one bowl. An
-- ingredient whose usage is a guess makes every COGS figure downstream a
-- guess too.
--
-- So gas is a running cost, averaged over the days it actually covered. That
-- adapts on its own: busier months mean more refills mean a higher daily
-- figure, with nothing to maintain. `size_label` keeps the tank size as text
-- ("22kg", "11kg") because the price moves and the size does not — which is
-- also what lets a screen say how long a tank usually lasts.
-- ============================================================
create table if not exists running_costs (
  id uuid primary key default gen_random_uuid(),

  label text not null,
  /* 'supplies' | 'gas' | 'repair' | 'other'. Text with a check rather than an
     enum, so adding a kind later is one migration and not a type rewrite —
     the same choice 0042 made for the money pots. */
  kind text not null default 'supplies',

  amount numeric(12, 2) not null,
  /* For gas: "22kg" / "11kg". The price moves between refills and the size
     does not, which is what makes "a 22kg tank lasts you about 24 days" a
     sentence the shop can act on. */
  size_label text,

  spent_on date not null default current_date,

  supplier_id uuid references suppliers(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'running_costs_kind_known') then
    alter table running_costs add constraint running_costs_kind_known
      check (kind in ('supplies', 'gas', 'repair', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'running_costs_amount_positive') then
    alter table running_costs add constraint running_costs_amount_positive
      check (amount > 0);
  end if;
end $$;

comment on table running_costs is
  'What the shop consumes that is neither an ingredient, a fixed cost nor an asset: supplies, gas, repairs. Averaged over the days it covered and added to break-even, the same treatment spoilage gets — without it the shop is told it needs less a day than it does.';
comment on column running_costs.size_label is
  'Free text for gas: "22kg", "11kg". The price moves between refills; the size does not.';

create index if not exists idx_running_costs_spent on running_costs(spent_on desc);
create index if not exists idx_running_costs_kind on running_costs(kind, spent_on desc);

alter table running_costs enable row level security;

/* The shift buys the alcohol and refills the gas, so the shift may record it.
   Only the owner and a manager may remove one. */
drop policy if exists "staff_read_running_costs" on running_costs;
create policy "staff_read_running_costs" on running_costs
  for select using (is_staff());

drop policy if exists "staff_add_running_costs" on running_costs;
create policy "staff_add_running_costs" on running_costs
  for insert with check (is_staff());

drop policy if exists "manager_manage_running_costs" on running_costs;
create policy "manager_manage_running_costs" on running_costs
  for all using (is_manager()) with check (is_manager());


-- ============================================================
-- 5. An asset should say which pot paid for it
--
-- `assets` has recorded what the shop bought since 0019 and never where the
-- money came from, because at the time nothing deducted anything. Now that a
-- purchase can move a pot, an asset bought through the Spend flow writes its
-- ledger line like everything else — and the column says which one, so the
-- two can be reconciled rather than merely both existing.
-- ============================================================
alter table assets
  add column if not exists paid_from text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assets_paid_from_known') then
    alter table assets add constraint assets_paid_from_known
      check (paid_from is null or paid_from in ('cash', 'gcash', 'bank', 'unpaid'));
  end if;
end $$;

comment on column assets.paid_from is
  'Which pot paid for it, for assets bought through the Spend flow. NULL on every row written before 0045, when nothing deducted anything.';
