-- ============================================================
-- 0071 — what a supplier charges, before you buy
--
-- THE ASK
--
-- "dapat sa supplier, pwede na maiset ang price"
--
-- Which is a different thing from what 0045's `purchase_log` and the
-- Prices & history screen already do, and the difference is the whole
-- point of this table.
--
-- `purchase_log` is what the shop PAID. It is a fact, and it only
-- exists after the money has gone. The Prices & history screen reads it
-- and can tell you a supplier has got dearer — afterwards.
--
-- This is what a supplier SAYS. You ask around the market on a Tuesday:
-- Kambal wants ₱230 a kilo for chicken, Aling Nena wants ₱245. Nothing
-- has been bought and nothing may ever be. That is exactly the moment
-- the number is worth having, and until now there was nowhere to put it
-- except a free-text line reading "Chicken".
--
-- ── Why an ingredient link AND a label ──────────────────────────────
--
-- 0045 chose free text for `sells` and gave the reason: "a link to
-- `ingredients` would be wrong the moment a supplier sells something
-- that is not an ingredient — gas, bags, a repair." Still true. So a
-- row carries both: a label, always, which is what a person reads; and
-- an OPTIONAL ingredient, which is what lets the quote be compared
-- against what the shop is currently paying. Gas gets a price and no
-- comparison. Chicken gets both.
--
-- The label survives the ingredient being deleted, which is why it is
-- stored rather than joined for.
--
-- ── Why the unit is stored as quoted ────────────────────────────────
--
-- The market sells chicken by the kilo. `ingredients.cost` is per ONE
-- unit — ₱0.018 per gram of salt, not ₱18 per kilo — so a quote of
-- "₱230" means nothing without "for 1 kg" beside it.
--
-- Both halves are kept as the supplier said them. Turning that into a
-- comparable per-unit figure is `lib/supplier-quotes.ts`, and it refuses
-- to guess: kg to g and litres to ml it knows, and anything else it
-- says it cannot compare rather than inventing a factor. A wrong
-- conversion here would quietly make one supplier look a thousand times
-- cheaper than another.
-- ============================================================

create table if not exists supplier_prices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id) on delete cascade,

  /* Optional, and null for everything that is not an ingredient. When it
     is set, the quote can be held against what the shop currently pays. */
  ingredient_id text references ingredients(id) on delete set null,

  /* What a person reads. Always present, so a quote survives the
     ingredient being deleted and a gas refill has a name at all. */
  label text not null,

  /* What they said, in the shape they said it: "₱230 for 1 kg". */
  price numeric(12, 2) not null check (price >= 0),
  qty numeric not null default 1 check (qty > 0),
  unit text not null,

  /* A price from March is not an offer anybody can take today, and the
     screen says how old it is rather than presenting it as current. */
  quoted_on date not null default shop_date(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /* One current price per thing per supplier. This is a price LIST, not
     a history — what was actually paid is `purchase_log`, and keeping
     two histories of the same thing is how they come to disagree. */
  constraint supplier_prices_one_per_thing unique (supplier_id, label)
);

create index if not exists idx_supplier_prices_supplier
  on supplier_prices(supplier_id, label);
/* The other direction: "who sells chicken, and for how much" is the
   question this table exists to answer at the moment of buying. */
create index if not exists idx_supplier_prices_ingredient
  on supplier_prices(ingredient_id) where ingredient_id is not null;

comment on table supplier_prices is
  'What a supplier SAYS they charge, typed in before anything is bought. '
  'Distinct from `purchase_log`, which is what was actually paid and only '
  'exists afterwards.';
comment on column supplier_prices.qty is
  'The quantity the price is for. "₱230 for 1 kg" is price 230, qty 1, '
  'unit kg — kept as quoted, because turning it into the ingredient''s own '
  'unit is a conversion that can be wrong and must be able to refuse.';

alter table supplier_prices enable row level security;

/* Read by anyone who does the buying — the point is to have it standing
   at the market. Written by whoever may manage stock, the same line the
   restock form draws: you cannot record a delivery without knowing what
   was paid for it. */
drop policy if exists "stock_read_supplier_prices" on supplier_prices;
create policy "stock_read_supplier_prices" on supplier_prices
  for select using (is_staff());

drop policy if exists "manager_write_supplier_prices" on supplier_prices;
create policy "manager_write_supplier_prices" on supplier_prices
  for all using (is_manager()) with check (is_manager());

/* Touched on every change, so "quoted three months ago" stays true even
   when somebody only fixes a typo in the note. */
create or replace function touch_supplier_price()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists supplier_prices_touch on supplier_prices;
create trigger supplier_prices_touch
  before update on supplier_prices
  for each row execute function touch_supplier_price();
