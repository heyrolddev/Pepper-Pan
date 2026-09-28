-- ============================================================
-- 0064 — discounts at the counter, promo codes online
--
-- THE ASK
--
-- Two things that look like one: the cashier wants to knock money off a
-- sale standing at the stall, and the shop wants to hand out a code a
-- customer types before checking out. Same arithmetic, different trust.
--
-- WHAT MAKES THIS DIFFERENT FROM EVERY OTHER FEATURE HERE
--
-- This one gives food away. Every other thing in this system records what
-- happened; a discount CHANGES what is owed, which means it is the first
-- place where a bug, or a browser, or a bored staff member costs the shop
-- real money on purpose. So the rules are in the database and the money is
-- computed on the server, and nothing a phone sends is believed.
--
-- THE FOUR THINGS A CODE HAS TO REFUSE
--
--   Expired, or not started yet.
--   Switched off.
--   Used more times than the shop allowed — in total, or by one customer.
--   Not applicable: below the minimum spend, or the dish it is for is not
--   in the basket.
--
-- Each of those is a separate reason, and the customer is told which. "That
-- code is invalid" over a code that simply starts tomorrow is how a shop
-- gets a message on Messenger it has to answer by hand.
--
-- WHY REDEMPTIONS ARE THEIR OWN TABLE
--
-- A counter on the promo row cannot answer "has THIS customer used it", and
-- it cannot be undone when an order is cancelled. A row per use answers
-- both, and gives the shop the one report it will actually want: who used
-- what, and what it cost.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The promos themselves
-- ------------------------------------------------------------
create table if not exists promos (
  id text primary key default gen_random_uuid()::text,

  /* Null for a counter-only discount the cashier picks from a list — those
     have no code because nobody types them. Uppercased and unique so
     "sulit50" and "SULIT50" cannot both exist and confuse a customer
     reading a poster. */
  code text unique,

  /** What the customer and the cashier see. */
  label text not null,
  description text,

  /* Percent off, or pesos off. Two kinds rather than one "amount" plus a
     flag, because the check constraints below differ: a percent above 100
     is nonsense, a peso amount above 100 is a Tuesday. */
  kind text not null check (kind in ('percent', 'amount')),
  value numeric not null check (value > 0),

  /* What it applies to. 'order' is the whole basket; 'meal' is one dish,
     and then `meal_id` says which — that is the "promo on a specific dish"
     the shop asked for. */
  scope text not null default 'order' check (scope in ('order', 'meal')),
  meal_id text references meals(id) on delete cascade,

  /** Below this the code does not apply. Null means no floor. */
  min_spend numeric not null default 0 check (min_spend >= 0),
  /** A ceiling on a percent promo, so "50% off" cannot cost ₱900 on a party
      order. Null means no cap. */
  max_discount numeric check (max_discount is null or max_discount > 0),

  /** Null means unlimited. */
  max_uses int check (max_uses is null or max_uses > 0),
  /** Per customer. Null means unlimited; 1 is the usual "one each". */
  max_per_customer int check (max_per_customer is null or max_per_customer > 0),

  starts_on date,
  ends_on date,

  /** Where it may be used. Both by default. */
  online boolean not null default true,
  at_counter boolean not null default true,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,

  /* A percent over 100 would pay the customer to eat here. */
  constraint promos_percent_sane
    check (kind <> 'percent' or value <= 100),
  /* A dish promo with no dish applies to nothing and would silently never
     fire — the worst failure for a promo, because the shop advertises it
     and then argues with a customer at the counter. */
  constraint promos_meal_scope_has_a_meal
    check (scope <> 'meal' or meal_id is not null),
  /* A window that ends before it starts can never be used. */
  constraint promos_window_sane
    check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index if not exists idx_promos_code on promos(code) where code is not null;

comment on table promos is
  'Discounts. The rules live here and the money is computed on the server '
  'from them — nothing a phone sends about a price is ever believed.';

-- ------------------------------------------------------------
-- 2. Every use, one row
--
-- A counter on the promo row cannot answer "has this customer used it", and
-- cannot be undone when an order is cancelled. This can do both, and is the
-- one report the shop will actually want.
-- ------------------------------------------------------------
create table if not exists promo_redemptions (
  id text primary key default gen_random_uuid()::text,
  promo_id text not null references promos(id) on delete cascade,
  /* CASCADE, so cancelling and deleting an order frees the use back up.
     A redemption pointing at an order that no longer exists is a use the
     customer is still being charged for in the count. */
  order_id text not null references orders(id) on delete cascade,
  /* Null for a walk-in: there is no account behind the counter, which is
     also why `max_per_customer` cannot be enforced there. Said in the UI
     rather than pretended about. */
  customer_id uuid references auth.users(id) on delete set null,
  /** What it actually took off, in pesos. */
  amount numeric not null check (amount >= 0),
  date date not null default shop_date(),
  created_at timestamptz not null default now(),

  /* One promo per order. Stacking is a whole second conversation — which
     applies first, whether a percent compounds — and a shop that has not
     asked for it should not get it by accident. */
  unique (order_id)
);

create index if not exists idx_promo_redemptions_promo on promo_redemptions(promo_id);
create index if not exists idx_promo_redemptions_customer
  on promo_redemptions(customer_id) where customer_id is not null;

comment on table promo_redemptions is
  'One row per use. Answers "how many times" and "has this customer used '
  'it" — neither of which a counter on the promo row can — and frees the '
  'use back up when an order is deleted.';

-- ------------------------------------------------------------
-- 3. What the order remembers
--
-- `revenue` stays what was actually COLLECTED, because that is what the
-- books, the drawer and every report already mean by it. The discount is
-- recorded beside it so the shop can see what the promos cost without the
-- takings being overstated to make them visible.
-- ------------------------------------------------------------
alter table orders add column if not exists discount numeric not null default 0
  check (discount >= 0);
alter table orders add column if not exists promo_code text;

comment on column orders.discount is
  'Pesos taken off this order. `revenue` is already NET of it — what the '
  'drawer actually took — so adding the two gives what the order would '
  'have been at full price.';
comment on column orders.promo_code is
  'The code as the customer typed it, or the label of a counter discount. '
  'Kept on the order even if the promo is later deleted: a receipt has to '
  'stay explicable.';

/* Column grants on `orders` are issued one by one — the cost columns are
   staff-only — so a new column is INVISIBLE to a browser session until this
   runs. Without it the customer's own order page would simply not see the
   discount it was just given, which is the silent half of this feature
   failing. A behaviour check refuses the migration that forgets. */
select regrant_visible_columns();

-- ------------------------------------------------------------
-- 4. Who may read and write
--
-- A customer must be able to CHECK a code — that is the whole feature — but
-- must not be able to read the list of every code the shop has ever made,
-- which is a coupon book. So: no public select on `promos` at all, and the
-- check happens through a function below that answers about ONE code.
-- ------------------------------------------------------------
alter table promos enable row level security;
alter table promo_redemptions enable row level security;

drop policy if exists "staff_read_promos" on promos;
create policy "staff_read_promos" on promos for select using (is_staff());

drop policy if exists "owner_write_promos" on promos;
create policy "owner_write_promos" on promos
  for all using (is_owner()) with check (is_owner());

drop policy if exists "staff_read_redemptions" on promo_redemptions;
create policy "staff_read_redemptions" on promo_redemptions
  for select using (is_staff());

/* A customer may see their OWN uses — "you have already used this" has to
   be checkable — and nobody else's. */
drop policy if exists "own_redemptions" on promo_redemptions;
create policy "own_redemptions" on promo_redemptions
  for select using (customer_id = auth.uid());
