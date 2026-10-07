/*
 * What each branch offers.
 *
 * Express sells a subset of the Apalit menu at the same prices, plus a dish
 * or two that only make sense at a food park. So a dish needs to say WHERE
 * it is offered — and that is the only thing a branch may decide about a
 * dish.
 *
 * ── Availability is adaptable; the recipe is fixed ───────────────────────
 *
 * This is the rule that keeps the commissary model alive, and it is why
 * this table holds a pair of ids and nothing else. A branch may say "not
 * here" and "sold out tonight". A branch may not change what a dish is, what
 * goes in it, or what it costs — those live at main, because main is what
 * cooks the sauce. Let a branch edit a recipe and Apalit cooks one thing
 * while the branch's costing believes another, and within a few months no
 * figure in either place can be trusted.
 *
 * Price is deliberately absent for the same reason. The shop decided one
 * price everywhere; a per-branch price column would be an invitation to
 * drift that nobody asked for, and adding one later is a migration rather
 * than a regret.
 *
 * ── Presence is the answer ───────────────────────────────────────────────
 *
 * A row means offered. No row means not offered. There is no `offered`
 * boolean, because then "false" and "no row at all" would be two spellings
 * of the same thing and every reader would have to handle both.
 */

create table if not exists meal_branches (
  meal_id text not null references meals(id) on delete cascade,
  branch_id text not null references branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meal_id, branch_id)
);

comment on table meal_branches is
  'Which branches offer which dish. A row means offered. The only thing a '
  'branch decides about a dish — the recipe and the price stay at main.';

/* The booth's menu is read by branch every time the till or the menu page
   loads, so that is the index. */
create index if not exists meal_branches_branch_idx
  on meal_branches (branch_id);

alter table meal_branches enable row level security;

/* Read by anyone, including a signed-out customer: this decides what the
   public menu shows. Written by a manager or above — the same capability
   that already covers marking a dish sold out, because it is the same kind
   of decision made by the same person on the same day. */
drop policy if exists "anyone_reads_meal_branches" on meal_branches;
create policy "anyone_reads_meal_branches" on meal_branches for select using (true);

drop policy if exists "manager_writes_meal_branches" on meal_branches;
create policy "manager_writes_meal_branches" on meal_branches
  for all using (is_manager()) with check (is_manager());

-- ------------------------------------------------------------
-- Every dish that exists today is offered at main
-- ------------------------------------------------------------

insert into meal_branches (meal_id, branch_id)
select m.id, b.id from meals m cross join branches b where b.is_main
on conflict do nothing;

-- ------------------------------------------------------------
-- And so is every dish added tomorrow
--
-- Without this a newly created dish would be offered NOWHERE — it would
-- vanish from the menu the moment it was saved, which reads as the save
-- having failed. The owner adds a dish at the commissary and then ticks the
-- booth if it belongs there; that is the order the work actually happens in.
-- ------------------------------------------------------------

create or replace function offer_new_meal_at_main()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into meal_branches (meal_id, branch_id)
  select new.id, b.id from branches b where b.is_main
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists offer_new_meal_at_main on meals;
create trigger offer_new_meal_at_main
  after insert on meals
  for each row execute function offer_new_meal_at_main();

-- ------------------------------------------------------------
-- The table ledger learns the new table
--
-- 0078 fails if a table stands nowhere, and this is that check doing its
-- job: `meal_branches` did not exist when the ledger was written, so the
-- ledger is re-created here with it added. That is the intended workflow,
-- not a patch — the list cannot rot because the database refuses to let it.
-- ------------------------------------------------------------

create or replace function branch_table_ledger()
returns table (tbl text, standing text)
language sql immutable
set search_path = public
as $$
  select t, 'scoped'::text from unnest(array[
    'orders', 'profiles',
    /* New in 0080. Each row is one branch's answer about one dish. */
    'meal_branches'
  ]) t
  union all
  select t, 'pending'::text from unnest(array[
    'cash_ledger', 'receivables',
    'fixed_costs', 'monthly_bills',
    'running_costs', 'assets',
    'staff_shifts',
    'waste_log', 'cycle_counts', 'consumption_log',
    'shop_hours', 'shop_closures',
    'payment_settings',
    'activity_log'
  ]) t
  union all
  select t, 'shared'::text from unnest(array[
    'branches',
    'ingredients', 'ingredient_lots', 'batches', 'batch_ingredients',
    'meals', 'meal_ingredients', 'meal_components', 'meal_packaging',
    'meal_modifier_groups', 'modifier_groups', 'modifier_options',
    'modifier_option_prices', 'product_modifier_groups',
    'menu_categories', 'menu_products', 'order_packaging',
    'suppliers', 'supplier_prices', 'supplier_debts', 'purchase_log',
    'oe_templates',
    'order_lines', 'order_line_extras',
    'announcements', 'faq_entries', 'marketing_campaigns',
    'promos', 'promo_redemptions', 'reviews',
    'chat_threads', 'chat_messages', 'chat_settings',
    'settings', 'shop_settings', 'delivery_settings',
    'device_sessions', 'push_subscriptions', 'error_log',
    'messenger_events', 'restore_snapshots'
  ]) t
$$;

-- ---------------------------------------------------------------
-- Behaviour checks
-- ---------------------------------------------------------------

do $$
declare
  v_meal text;
  v_at_main int;
  v_at_booth int;
begin
  /* A new dish is offered at the commissary and nowhere else.

     The failure this guards against looks like a bug in the save: the owner
     adds a dish, it is offered nowhere, and it disappears from the menu the
     moment they press the button. */
  insert into meals (name, price) values ('ZZ Branch Dish', 150) returning id into v_meal;

  select count(*) into v_at_main
    from meal_branches where meal_id = v_meal and branch_id = 'main';
  select count(*) into v_at_booth
    from meal_branches where meal_id = v_meal and branch_id = 'express-el-mercado';

  if v_at_main <> 1 then
    raise exception 'FAIL: a new dish is not offered at the commissary — it would vanish from the menu the moment it was saved';
  end if;
  if v_at_booth <> 0 then
    raise exception 'FAIL: a new dish was offered at the booth without anybody saying so';
  end if;

  /* Offering it at the booth is one row, and offering it twice is still one. */
  insert into meal_branches (meal_id, branch_id) values (v_meal, 'express-el-mercado');
  insert into meal_branches (meal_id, branch_id) values (v_meal, 'express-el-mercado')
  on conflict do nothing;
  select count(*) into v_at_booth
    from meal_branches where meal_id = v_meal and branch_id = 'express-el-mercado';
  if v_at_booth <> 1 then
    raise exception 'FAIL: a dish was offered at the same branch twice';
  end if;

  /* Taking a dish off the booth's menu leaves Apalit's alone. */
  delete from meal_branches where meal_id = v_meal and branch_id = 'express-el-mercado';
  if not exists (select 1 from meal_branches where meal_id = v_meal and branch_id = 'main') then
    raise exception 'FAIL: removing a dish from the booth removed it from the commissary too';
  end if;

  /* And deleting the dish takes its answers with it rather than leaving
     rows pointing at nothing. */
  delete from meals where id = v_meal;
  if exists (select 1 from meal_branches where meal_id = v_meal) then
    raise exception 'FAIL: a deleted dish left its branch rows behind';
  end if;

  raise notice 'OK: a new dish starts at the commissary, the booth is opt-in, and the two are independent';
end $$;

do $$
declare
  v_orphans int;
begin
  /* Every dish that existed before this migration is offered somewhere.
     One dish silently offered nowhere is one dish that disappears from the
     menu, and nobody would connect that to a migration about branches. */
  select count(*) into v_orphans
    from meals m
   where not exists (select 1 from meal_branches mb where mb.meal_id = m.id);

  if v_orphans > 0 then
    raise exception
      'FAIL: % dish(es) are offered at no branch at all and would vanish from every menu', v_orphans;
  end if;

  raise notice 'OK: every dish that already existed is offered at the commissary';
end $$;
