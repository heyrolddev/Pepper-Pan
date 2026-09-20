-- ============================================================
-- 0048 — One menu item, several ways of having it
--
-- THE PROBLEM, AS THE MENU SHOWS IT TODAY
--
-- "16oz Iced Spanish Latte ₱75" and "22oz Iced Spanish Latte ₱89" sit beside
-- each other as two cards with the same photograph. So do four Giant Ji Pai —
-- original, spicy, with cheese, with cheese and spicy — four cards, two
-- photographs, one dish. A customer scrolling that reads it as a menu with
-- duplicates in it, and a menu that looks unfinished is one people trust less
-- than the food deserves.
--
-- WHAT IS NOT CHANGING, AND WHY THAT IS THE WHOLE DESIGN
--
-- Each of those four Ji Pai stays its own row in `meals`. That is not
-- conservatism, it is the only correct model: the spicy one has chilli in its
-- recipe and the plain one does not, the 22oz draws more milk and a bigger
-- cup, and every one of them has its own true cost, its own stock position,
-- its own sales history and its own "sold out today" switch. Folding them
-- into one dish with a price list would throw away the costing the whole of
-- HQ is built on — `meal_ingredients`, `consume_for_order`, `orders.cogs`,
-- the menu-engineering quadrants — to make a menu card look tidier.
--
-- So nothing about how a dish is costed, stocked, sold or counted moves. What
-- is added is a layer ABOVE the dishes that says "these four are one thing to
-- a customer", and two columns on `meals` saying which thing and which way.
--
-- WHY THE OPTIONS ARE A JSONB OBJECT AND NOT FOUR MORE TABLES
--
-- The textbook shape is products → option groups → option values → a join
-- table mapping combinations to variants. Four tables to hold, for this shop,
-- the fact that a latte comes in two sizes.
--
-- Worse than the size of it, those tables can disagree with reality: an
-- option group can list a value no variant has, and a combination can exist
-- with nothing behind it. Then the customer picks 22oz with cheese and the
-- page has nothing to put in the basket.
--
-- Here the variants ARE the source of the options. `{"Size": "22oz"}` on the
-- dish, and the product's axes are worked out by reading its variants — so a
-- size exists exactly when a dish exists that has it, and the two cannot
-- drift because there is only one of them. See src/lib/menu-products.ts.
-- ============================================================

create table if not exists menu_products (
  id text primary key default gen_random_uuid()::text,

  /* What the card says. The one thing that genuinely cannot be derived: the
     dishes are called "16oz Iced Spanish Latte" and "22oz Iced Spanish
     Latte", and no amount of string-trimming reliably yields "Iced Spanish
     Latte" — "Giant Jipai (SPICY)" and "Giant Jipai w/cheese (SPICY)" share a
     prefix that is not the name either. So the owner types it once. */
  name text not null,

  /* Both nullable, and both fall back to the dish rather than being copied
     into it. A group whose description is null shows its first variant's, so
     grouping four dishes that already have good descriptions costs no
     retyping — and changing the dish's still changes what the customer
     reads. Copying would have frozen it at the moment of grouping. */
  description text,
  image_url text,

  /* Menu order, ties breaking on name — same rule as menu_categories, so an
     unordered menu is still stable rather than shuffling between loads. */
  sort_order int not null default 0,

  /* Off without ungrouping. Switching a group off puts its dishes back on the
     menu as individual cards, which is what they were before — nothing
     disappears from sale, and no recipe or history is touched. */
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table meals
  /* ON DELETE SET NULL, emphatically not CASCADE.
     Deleting a grouping is a presentation decision — "show these as four
     cards again". Cascading would take four dishes with it, and with them
     their recipes, their costs and every order line that ever pointed at
     them. One careless tap on a tidy-up button would erase the shop's own
     sales history. */
  add column if not exists product_id text
    references menu_products(id) on delete set null,

  /* Which way of having it this dish is: {"Size":"22oz"},
     {"Flavour":"Spicy","Cheese":"With cheese"}. Empty for a dish that is not
     in a group, which is most of them. */
  add column if not exists options jsonb not null default '{}'::jsonb,

  /* Order within its group — the order the chips are offered in. Separate
     from the menu's own ordering because "16oz before 22oz" has nothing to do
     with where the latte sits among the drinks. */
  add column if not exists variant_sort int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'meals_options_is_object'
  ) then
    /* An array or a bare string here would not fail until something tried to
       read a key off it, which would be in the middle of rendering the menu
       to a customer. */
    alter table meals add constraint meals_options_is_object
      check (jsonb_typeof(options) = 'object');
  end if;
end $$;

create index if not exists idx_meals_product on meals(product_id, variant_sort);

comment on column meals.options is
  'Which variant of its group this dish is — {"Size":"22oz"}. The product''s available options are READ from these, so an option exists exactly when a dish has it.';
comment on column meals.product_id is
  'The menu card this dish is one way of having. Null for a dish that is its own card, which is most of them.';

alter table menu_products enable row level security;

/* Read by everyone: this is what the customer's menu is built from. */
drop policy if exists "read_menu_products" on menu_products;
create policy "read_menu_products" on menu_products for select using (true);

/* Written by the owner. Grouping decides what the menu looks like, the same
   as a price or a photograph. */
drop policy if exists "owner_write_menu_products" on menu_products;
create policy "owner_write_menu_products" on menu_products
  for all using (is_owner()) with check (is_owner());
