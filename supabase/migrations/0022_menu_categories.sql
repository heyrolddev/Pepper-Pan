-- ============================================================
-- Categories become a thing, instead of a string typed on every dish
--
-- A dish's category has always been free text in an array on the dish itself.
-- That means "Chicken", "chicken" and "Chicken " are three categories, all
-- three show up as separate pills on the customer's menu, and the only way to
-- rename one is to open all seventy-two dishes.
--
-- It also means there is nowhere to hang a colour, which is what the owner
-- actually asked for. A colour belongs to the category, not to the dish —
-- storing it per-dish would let two dishes in "Chicken" disagree.
--
-- The dish keeps its `categories` array. This table is the vocabulary beside
-- it: which names exist, what colour each one is, and what order they appear
-- in. A dish naming a category that isn't in here still works and still shows
-- — it just gets a colour worked out from its name rather than a chosen one,
-- because a menu that stops rendering because a row is missing is a far worse
-- failure than one that picks its own green.
-- ============================================================

create table if not exists menu_categories (
  name text primary key,
  /* A palette token — 'brand', 'gold', 'jade' … — not a hex code. Tailwind
     builds its stylesheet from the source, so a class assembled at runtime
     from a hex produces no CSS and no error; and a freely-picked colour can
     land as pale yellow on cream. The app's list is in src/lib/categories.ts.
     Not constrained here on purpose: adding a colour to the palette should be
     one edit in the app, not a migration. An unknown token falls back. */
  colour text not null default 'ink',
  /* Menu order. Ties break on name, so an unordered menu is still stable. */
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table menu_categories enable row level security;

/* Read by everyone: the customer's menu is where these are actually shown. */
drop policy if exists "read_menu_categories" on menu_categories;
create policy "read_menu_categories" on menu_categories for select using (true);

/* Written by the owner. A category is a menu decision, the same as a price —
   and renaming one changes what every customer sees. */
drop policy if exists "owner_write_menu_categories" on menu_categories;
create policy "owner_write_menu_categories" on menu_categories
  for all using (is_owner()) with check (is_owner());

-- ============================================================
-- Seeded from the menu that already exists
--
-- Nobody should have to type in the categories they have been using for
-- months. Every distinct first-category on a dish becomes a row, trimmed,
-- and case-folded together so "Chicken" and "chicken" land on whichever
-- spelling the menu uses most rather than becoming two rows.
--
-- Colours are assigned round-robin over the palette so the shop opens with a
-- menu that already looks colour-coded, rather than eight identical grey
-- chips and a job to do. The owner changes any of them in one tap.
-- ============================================================
insert into menu_categories (name, colour, sort_order)
select
  name,
  (array['brand', 'gold', 'jade', 'chili', 'teal', 'brown', 'ink', 'sand'])[
    1 + ((row_number() over (order by uses desc, name)) - 1) % 8
  ],
  (row_number() over (order by uses desc, name))::int * 10
from (
  select
    /* The most-used spelling wins the name. */
    (array_agg(raw order by n desc, raw))[1] as name,
    sum(n) as uses
  from (
    select btrim(categories[1]) as raw, count(*) as n
    from meals
    where cardinality(categories) > 0 and btrim(categories[1]) <> ''
    group by btrim(categories[1])
  ) spellings
  group by lower(raw)
) folded
on conflict (name) do nothing;
