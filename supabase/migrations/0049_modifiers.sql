-- ============================================================
-- 0049 — Add-ons: extra rice, and a drink with that
--
-- WHAT THIS IS FOR
--
-- "Pwede bang dagdagan ng kanin?" and "pwede bang mamili ng inumin, parang
-- combo?" Every fast-food counter in the country answers both, and until now
-- this one could only answer them by inventing another dish: a "Pork Solo
-- Rice + Extra Rice + Coke", and then the same again for every drink and
-- every flavour. Solo Ji Pai alone — two flavours, with-rice, extra-rice, six
-- drinks — is 48 rows in `meals`, 48 recipes to keep in step, 48 prices to
-- change when rice goes up, and a best-seller list split 48 ways.
--
-- WHY THIS IS NOT THE SAME THING AS 0048
--
-- 0048 was about which dish this IS. Exactly one answer, its own recipe, its
-- own cost, its own stock, its own photograph. A 22oz latte is not a 16oz
-- with something added to it.
--
-- This is about what is added ON TOP. Zero or more answers, each one drawing
-- its own stock and adding its own money, and the dish underneath is
-- unchanged. Confusing the two is what produces a 48-row menu: size is a
-- variant, "make it a meal" is a modifier, and a system with only the first
-- has to spell out the second.
--
-- THE ONE DECISION EVERYTHING ELSE FOLLOWS FROM
--
-- An option POINTS AT A REAL DISH. "Extra rice" is a `meals` row — hidden
-- from the menu, with a recipe, a price and a stock position — and the option
-- is a pointer to it.
--
-- That is not a modelling preference, it is the reason this feature costs
-- almost no new code. `order_requirements()` has walked
-- order_lines → meal_components → meal_ingredients recursively since 0016, so
-- an extra that names a dish is already costed, already deducts its rice,
-- already lands in `orders.cogs` and already shows in the day's margin. The
-- alternative — a price and a name on the option, with no dish behind it — is
-- a sale the shop makes with no cost against it, which quietly overstates the
-- profit on every combo it ever sells. The one number the owner most needs to
-- be true is the one that shape would break.
--
-- WHY GROUPS ARE REUSABLE AND NOT PER-DISH
--
-- "Choose your drink" is the same six drinks on every rice meal. Attached to
-- each dish separately, adding a seventh drink is fourteen edits and a
-- guarantee that one gets missed. A group is written once and attached — to a
-- dish, or to a whole menu card at once, which is the common case because a
-- card's variants all take the same add-ons.
-- ============================================================

/* One question to ask the customer. "Extra rice?" — "Choose your drink". */
create table if not exists modifier_groups (
  id text primary key default gen_random_uuid()::text,

  /* What the customer is asked. Shown as the heading above the options. */
  name text not null,

  /* The small grey line under it. Optional, because most groups say enough
     with their name and a helper that repeats the name is noise. */
  helper text,

  /* How many may be chosen. The pair covers every shape a counter actually
     uses, without a `type` column that could disagree with them:
       (0,1) optional pick-one   — "Add a drink?"
       (1,1) required pick-one   — "Choose your drink" on a combo
       (0,3) up to three extras  — "Add-ons"
     A required group is min_select >= 1, which is a fact about the numbers
     rather than a third column free to contradict them. */
  min_select int not null default 0,
  max_select int not null default 1,

  sort_order int not null default 0,

  /* Off without deleting. A group switched off stops being offered and every
     order that already carries its options keeps them — see the snapshot on
     `order_line_extras` below. */
  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  constraint modifier_groups_select_range
    check (min_select >= 0 and max_select >= 1 and max_select >= min_select)
);

/* One thing that can be chosen, and the dish it actually is. */
create table if not exists modifier_options (
  id text primary key default gen_random_uuid()::text,
  group_id text not null references modifier_groups(id) on delete cascade,

  /* The dish this option adds to the order.
   
     ON DELETE SET NULL rather than CASCADE or RESTRICT. Cascading would let
     deleting a hidden "Extra rice" dish silently empty a group the owner
     still sees on the menu; restricting would mean a dish can never be
     deleted once anybody made it an option. Nulled, the option survives with
     its label and stops drawing stock — and the editor says so in words,
     which is the only version of this the owner can act on. */
  option_meal_id text references meals(id) on delete set null,

  /* What the chip says. Usually the dish's name, but not always: the dish is
     called "Extra Rice (cup)" and the chip should say "Extra rice". */
  label text not null,

  /* NULL means "charge whatever that dish costs", which is the answer that
     stays right when rice goes up. A number overrides it — nearly always 0,
     for a drink that comes free with the combo. */
  price_override numeric check (price_override is null or price_override >= 0),

  sort_order int not null default 0,
  is_active boolean not null default true
);
create index if not exists idx_modifier_options_group
  on modifier_options(group_id, sort_order);

/* Attached to one dish. */
create table if not exists meal_modifier_groups (
  meal_id text not null references meals(id) on delete cascade,
  group_id text not null references modifier_groups(id) on delete cascade,
  sort_order int not null default 0,
  primary key (meal_id, group_id)
);

/* Attached to a whole menu card, which is how it is nearly always wanted:
   all four Solo Ji Pai take the same drinks, and attaching per-dish means
   four places for them to drift apart. */
create table if not exists product_modifier_groups (
  product_id text not null references menu_products(id) on delete cascade,
  group_id text not null references modifier_groups(id) on delete cascade,
  sort_order int not null default 0,
  primary key (product_id, group_id)
);

/* What was actually chosen, on the line it was chosen for.
 
   Every column except the pointers is a SNAPSHOT. A receipt is a record of
   what happened; renaming "Coke" to "Coke Zero" next month must not rewrite
   what last week's customer was charged for. `order_lines.price_at_sale` has
   worked this way since 0001 and this is the same rule one level down. */
create table if not exists order_line_extras (
  id bigserial primary key,
  order_line_id bigint not null references order_lines(id) on delete cascade,

  /* Where it came from, for reporting — "how many combos took the iced tea".
     Nulled if the option is deleted, which costs a report and not a receipt. */
  option_id text references modifier_options(id) on delete set null,

  /* What to take off the shelf. Nulled if the dish is deleted: the line stays
     on the receipt at the price that was paid, and stops being costed, which
     is the honest answer once the recipe it was costed from is gone. */
  meal_id text references meals(id) on delete set null,

  /* The two that must never move. */
  label text not null,
  price_at_sale numeric not null default 0,

  /* Per unit of the line. Two rice meals with extra rice is one row at qty 1
     on a line of qty 2, and the multiplication happens where the stock moves. */
  qty numeric not null default 1 check (qty > 0)
);
create index if not exists idx_order_line_extras_line
  on order_line_extras(order_line_id);
create index if not exists idx_order_line_extras_option
  on order_line_extras(option_id);

-- ============================================================
-- Requirements, with the add-ons in them
--
-- This is the whole of the stock and costing work, and it is one extra branch
-- on the seed of a recursion that already existed. An extra names a dish, so
-- from the second line down this is the 0016/0020 function unchanged: the
-- extra's own recipe, its own components, and its own packaging all follow.
--
-- Replaced in full rather than patched, because 0020 already replaced the
-- 0016 version to add packaging and the live definition is that one.
-- ============================================================
create or replace function order_requirements(p_order_id text)
returns table (ref_type text, ref_id text, qty numeric)
language sql
stable
as $$
  with
  ord as (select fulfillment from orders where id = p_order_id),
  packed as (select (select fulfillment from ord) <> 'dine_in' as yes),

  /* Everything the order puts on a plate: the dishes ordered, and the dishes
     added to them. `e.qty * ol.qty` is the multiplication that matters — one
     "extra rice" on a line of three is three portions of rice. */
  seed as (
    select ol.meal_id, ol.qty::numeric as mult
    from order_lines ol
    where ol.order_id = p_order_id
    union all
    select e.meal_id, (e.qty * ol.qty)::numeric
    from order_line_extras e
    join order_lines ol on ol.id = e.order_line_id
    where ol.order_id = p_order_id and e.meal_id is not null
  ),
  tree as (
    with recursive meal_tree as (
      select s.meal_id, s.mult, 0 as depth from seed s
      union all
      select mc.component_meal_id, mt.mult * mc.qty, mt.depth + 1
      from meal_tree mt
      join meal_components mc on mc.meal_id = mt.meal_id
      where mt.depth < 5
    )
    select meal_id, mult from meal_tree
  ),
  food as (
    select mi.ref_type, mi.ref_id, sum(mi.qty * t.mult)::numeric as qty
    from tree t
    join meal_ingredients mi on mi.meal_id = t.meal_id
    group by mi.ref_type, mi.ref_id
  ),
  /* Packaging follows the dish that was ordered — and an add-on IS a dish
     that was ordered. A drink chosen as part of a combo leaves in a cup the
     same as one bought on its own, and the seed above is exactly the list of
     things that leave the stall. Components are deliberately not included:
     a combo's packaging is the combo's own, which is the 0020 rule. */
  dish_packaging as (
    select mp.ref_type, mp.ref_id, sum(mp.qty * s.mult)::numeric as qty
    from seed s
    join meal_packaging mp on mp.meal_id = s.meal_id
    where (select yes from packed)
    group by mp.ref_type, mp.ref_id
  ),
  /* Once per order, not once per dish. */
  per_order as (
    select op.ref_type, op.ref_id, op.qty::numeric as qty
    from order_packaging op
    where (select yes from packed)
      and exists (select 1 from order_lines where order_id = p_order_id)
  )
  select ref_type, ref_id, sum(qty)::numeric
  from (
    select * from food
    union all select * from dish_packaging
    union all select * from per_order
  ) all_lines
  group by ref_type, ref_id;
$$;

do $$
begin
  execute 'revoke all on function order_requirements(text) from public, anon, authenticated';
  execute 'grant execute on function order_requirements(text) to service_role';
end $$;

-- ============================================================
-- Who may read and write this
-- ============================================================
alter table modifier_groups enable row level security;
alter table modifier_options enable row level security;
alter table meal_modifier_groups enable row level security;
alter table product_modifier_groups enable row level security;
alter table order_line_extras enable row level security;

/* The first four are the menu. Read by everyone, written by the owner —
   an add-on carries a price, and prices are the owner's. */
do $$
declare t text;
begin
  foreach t in array array[
    'modifier_groups', 'modifier_options',
    'meal_modifier_groups', 'product_modifier_groups'
  ] loop
    execute format('drop policy if exists "read_%1$s" on %1$s', t);
    execute format('create policy "read_%1$s" on %1$s for select using (true)', t);
    execute format('drop policy if exists "owner_write_%1$s" on %1$s', t);
    execute format(
      'create policy "owner_write_%1$s" on %1$s for all using (is_owner()) with check (is_owner())',
      t
    );
  end loop;
end $$;

/* Extras are part of somebody's order, so they follow the order's own rule:
   the customer who placed it, and the shop. Written only by the server — the
   same as `order_lines`, whose insert policy this mirrors. */
drop policy if exists "read_own_order_line_extras" on order_line_extras;
create policy "read_own_order_line_extras" on order_line_extras
  for select using (
    is_staff() or exists (
      select 1 from order_lines ol
      join orders o on o.id = ol.order_id
      where ol.id = order_line_extras.order_line_id
        and o.customer_id = auth.uid()
    )
  );

drop policy if exists "insert_own_order_line_extras" on order_line_extras;
create policy "insert_own_order_line_extras" on order_line_extras
  for insert with check (
    is_staff() or exists (
      select 1 from order_lines ol
      join orders o on o.id = ol.order_id
      where ol.id = order_line_extras.order_line_id
        and o.customer_id = auth.uid()
    )
  );

comment on table modifier_groups is
  'One question asked about a dish — "Extra rice?", "Choose your drink". Reusable: attached to dishes and to whole menu cards.';
comment on column modifier_options.option_meal_id is
  'The dish this option adds. Its recipe is what makes the add-on cost real money and move real stock — see order_requirements().';
comment on column order_line_extras.label is
  'Snapshot of what the customer was offered. Never rewritten when the option is renamed.';
