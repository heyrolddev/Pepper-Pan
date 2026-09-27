-- ============================================================
-- 0061 — "Choose your drink" where every drink comes in two sizes
--
-- THE ASK
--
-- The drinks on a combo have sizes, and a size is not a label: a large iced
-- tea uses more tea, costs the shop more, and sells for more. Today the only
-- way to offer both is two separate options — "Iced Tea (Regular)" and "Iced
-- Tea (Large)" — so six drinks in two sizes is twelve chips in a row, and
-- nothing on screen says which two are the same drink.
--
-- WHY THIS ADDS ALMOST NO NEW IDEAS
--
-- Both halves already exist and neither needed inventing:
--
--   0048 said a SIZE IS A VARIANT. Each size is its own `meals` row with its
--   own recipe, its own cost, its own stock and its own price, grouped under
--   a `menu_products` card. That is the model the whole of HQ is costed on.
--
--   0049 said an OPTION POINTS AT A REAL DISH, which is why an add-on is
--   already costed, already deducts its stock and already lands in
--   `orders.cogs`.
--
-- So an option that comes in sizes is an option that points at a PRODUCT
-- instead of at one dish. The sizes are the product's variants — read, not
-- re-entered — and the one the customer picks is a dish, exactly as before.
--
-- THE CONSEQUENCE THAT MAKES THIS CHEAP
--
-- `order_line_extras.meal_id` has pointed at a dish since 0049. A chosen
-- variant IS a dish, so it is recorded the way every add-on already is:
-- `order_requirements()` walks it, `apply_order_stock` deducts it, the cost
-- lands in the order. Nothing on the ORDER side changes at all. Measured
-- this session: an add-on's ingredients and its packaging both move.
--
-- WHY NOT PUT THE SIZES ON THE OPTION ITSELF
--
-- It was the obvious shape and it is the wrong one. A drink sold both on the
-- menu and as a combo add-on would then have its sizes written down twice,
-- and the day a third size is added is the day the two disagree — the menu
-- offers 1L and the combo does not, with nothing anywhere to say why. The
-- product is the one place a drink's sizes live; this reads them.
-- ============================================================

-- ------------------------------------------------------------
-- 1. An option may name a product instead of a dish
-- ------------------------------------------------------------
alter table modifier_options
  /* ON DELETE SET NULL, matching `option_meal_id` and for the same reason:
     deleting a product must not silently empty a group the owner still sees
     on the menu, and must not be forbidden outright either. Nulled, the
     option survives with its label, stops being offered, and the editor says
     so in words — which is the only version of this the owner can act on. */
  add column if not exists option_product_id text
    references menu_products(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'modifier_options_one_target'
  ) then
    /* One or the other, never both.

       An option naming a dish AND a product has no answer to "what does this
       add to the order" — and the two would be resolved in different places,
       so the bug would surface as a price that is right on the menu and
       wrong on the receipt. Neither is allowed too: that is the state a
       deleted dish leaves behind, and `offerable` in lib/modifiers.ts already
       drops it rather than offering a sale the shop cannot cost. */
    alter table modifier_options add constraint modifier_options_one_target
      check (option_meal_id is null or option_product_id is null);
  end if;
end $$;

comment on column modifier_options.option_product_id is
  'A product, when this option comes in sizes — the customer picks the '
  'option, then which variant. The sizes are READ from the product''s '
  'variants, so they cannot drift from what the menu offers. Mutually '
  'exclusive with option_meal_id.';

-- ------------------------------------------------------------
-- 2. What each size costs the customer
--
-- `modifier_options.price_override` is one number for the whole option, and
-- for a sized option one number cannot say what the shop actually wants:
-- "regular is free with the combo, large is ₱15 more". Set it to 0 and the
-- large is free too; leave it null and the regular is charged in full.
--
-- So an override may be given per variant. Absent, the option's own override
-- applies; absent that, the variant dish's own price. Three steps, resolved
-- in one place — see `variantPrice` in lib/modifiers.ts, with its tests.
-- ------------------------------------------------------------
create table if not exists modifier_option_prices (
  option_id text not null references modifier_options(id) on delete cascade,
  meal_id text not null references meals(id) on delete cascade,

  /* Zero is a real answer — the size that comes free with the combo — which
     is why an absent row means "not set" rather than this defaulting to 0. */
  price numeric not null check (price >= 0),

  primary key (option_id, meal_id)
);

comment on table modifier_option_prices is
  'What one size of a sized add-on costs the customer, when it differs from '
  'that dish''s own price. Absent means fall back to the option''s override, '
  'then to the dish''s price.';

-- ------------------------------------------------------------
-- 3. Who may read it
--
-- The same shape `modifier_options` has: everyone reads it, because the
-- customer's menu is built from it, and only a manager writes it.
-- ------------------------------------------------------------
alter table modifier_option_prices enable row level security;

drop policy if exists "read_modifier_option_prices" on modifier_option_prices;
create policy "read_modifier_option_prices" on modifier_option_prices
  for select using (true);

drop policy if exists "manager_manage_modifier_option_prices" on modifier_option_prices;
create policy "manager_manage_modifier_option_prices" on modifier_option_prices
  for all using (is_manager()) with check (is_manager());
