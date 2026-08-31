-- ============================================================
-- The costs that arrive whether anyone buys anything
--
-- The system has known what a dish costs in ingredients since the costing
-- screens landed. It has never known what a *day* costs. Rent, kuryente,
-- tubig and sweldo turn up on the first of the month regardless of how many
-- bowls went out, and until they are somewhere the shop can only ever see
-- gross profit — a number that looks like earnings and isn't.
--
-- `orders.oe` and `orders.net_profit` have been columns since the first
-- migration and zero on every row ever written. This is what fills them.
-- ============================================================

create table if not exists fixed_costs (
  id text primary key default gen_random_uuid()::text,
  label text not null,
  /* Per month. Everything here is normalised to a month so one number can be
     divided by the days actually open — a weekly wage and a monthly rent in
     the same column would silently add a week to a month. */
  amount numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table fixed_costs enable row level security;

drop policy if exists "staff_read_fixed_costs" on fixed_costs;
create policy "staff_read_fixed_costs" on fixed_costs
  for select using (is_staff());

-- What the shop pays its landlord is the owner's business, not the shift's.
drop policy if exists "owner_manage_fixed_costs" on fixed_costs;
create policy "owner_manage_fixed_costs" on fixed_costs
  for all using (is_owner()) with check (is_owner());

-- ============================================================
-- What the stall is made of
--
-- The pans, the freezer, the signage, the cart. Not an expense — money that
-- turned into things — which is why it belongs apart from fixed costs and
-- answers a different question: how much of what was put in has come back.
-- ============================================================
create table if not exists assets (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  amount numeric not null default 0,
  bought_on date,
  note text,
  created_at timestamptz not null default now()
);

alter table assets enable row level security;

drop policy if exists "staff_read_assets" on assets;
create policy "staff_read_assets" on assets
  for select using (is_staff());

drop policy if exists "owner_manage_assets" on assets;
create policy "owner_manage_assets" on assets
  for all using (is_owner()) with check (is_owner());

-- When the owner drew the line and started counting payback from. Null until
-- they do — a payback figure measured from a date nobody chose is a number
-- with no meaning attached.
alter table settings add column if not exists payback_from date;

-- ============================================================
-- Cash ledger: a type worth constraining
--
-- The table has existed since 0001 with a free-text `type` and nothing has
-- ever written to it. Left free-text it becomes "drawer", "Drawer", "cash in"
-- and "cash-in" within a month, and no total can be trusted again.
-- ============================================================
alter table cash_ledger drop constraint if exists cash_ledger_type_check;
alter table cash_ledger add constraint cash_ledger_type_check
  check (type in ('in', 'out'));

alter table cash_ledger add column if not exists category text;
create index if not exists idx_cash_ledger_date on cash_ledger(date desc);

-- Receivables: partial collection, so "₱500 utang, ₱200 paid" is one row
-- rather than a deletion and a new one that loses the history.
alter table receivables add column if not exists amount_collected numeric not null default 0;
alter table receivables add column if not exists phone text;
create index if not exists idx_receivables_open on receivables(collected, date desc);
