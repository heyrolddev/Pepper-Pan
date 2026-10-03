/*
 * Pepper Pan Express — the first branch.
 *
 * A booth at Tambayan sa El Mercado, Calumpit, open Friday to Sunday nights.
 * Apalit cooks the sauce and the prepped pork; the booth griddles, plates and
 * sells. Supplies come from Apalit; the drawer, the rent and the appliances
 * are the booth's own.
 *
 * ── What this migration is, and is not ───────────────────────────────────
 *
 * It is the FOUNDATION: a branch exists, an order belongs to one, and a
 * person may be pinned to one. Transfers, the branch's own pots, its rent
 * and its derived shelf all come later and all lean on this.
 *
 * It is NOT a second system. One database, one menu, one cost book, one set
 * of recipes. What separates a branch is what an ACCOUNT may reach, never
 * where the data lives. Split the storage and there is no such thing as a
 * transfer — only a disposal at one end and an arrival at the other, with
 * nothing tying them together and the variance showing up in neither.
 *
 * ── Branch is a place, not a permission ──────────────────────────────────
 *
 * The two are deliberately orthogonal, and this is what keeps the whole
 * thing small:
 *
 *   role    WHAT you may do      (owner / manager / staff — already exists)
 *   branch  WHERE you may do it  (this migration)
 *
 * So "the Express account sees sales and stock but never margin" needs no
 * new concept at all: it is the existing `staff` role, which has never had
 * `costs` or `business`, pinned to the Express branch. The branch dimension
 * answers only WHICH ROWS. It never answers which verbs.
 *
 * A null `branch_id` on a profile means every branch — the owner, who roams.
 */

-- ------------------------------------------------------------
-- 1. The places
-- ------------------------------------------------------------

create table if not exists branches (
  /* A readable id rather than a uuid, on purpose. This value appears in
     every scoped query, in every policy, and in the owner's own eyes when
     reading a row. 'express-el-mercado' says what it is; a uuid does not,
     and the set is small and set by hand. */
  id text primary key,
  name text not null,
  /* The commissary. Exactly one, enforced below: it is where stock is
     bought, cooked and counted, and where recipes live. */
  is_main boolean not null default false,
  /* Apalit is a stall open daily; El Mercado is Friday to Sunday nights.
     Free text because a food park's hours are not a schema's business. */
  trading_note text,
  opened_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

/* One commissary, or the transfer model has no centre. A partial unique
   index rather than a check: a check cannot see the other rows. */
create unique index if not exists branches_one_main
  on branches (is_main) where is_main;

comment on table branches is
  'Where the shop sells. One row is the main branch — the commissary, where '
  'stock is bought, cooked and counted. The others are satellites that '
  'receive prepped items from it and sell.';

insert into branches (id, name, is_main, trading_note, opened_on) values
  ('main', 'Pepper Pan Apalit', true, 'Open daily', null)
on conflict (id) do nothing;

insert into branches (id, name, is_main, trading_note) values
  ('express-el-mercado', 'Pepper Pan Express — El Mercado', false,
   'Friday, Saturday and Sunday nights')
on conflict (id) do nothing;

alter table branches enable row level security;

/* Everyone who works here reads the list — a pinned member of staff still
   needs the name of their own branch on screen. Only the owner writes it:
   opening a branch is not a shift's decision. */
drop policy if exists "staff_read_branches" on branches;
create policy "staff_read_branches" on branches for select using (is_staff());

drop policy if exists "owner_writes_branches" on branches;
create policy "owner_writes_branches" on branches
  for all using (is_owner()) with check (is_owner());

-- ------------------------------------------------------------
-- 2. Where a person works
-- ------------------------------------------------------------

alter table profiles
  add column if not exists branch_id text references branches(id);

comment on column profiles.branch_id is
  'The one branch this person may see and write. Null means every branch — '
  'the owner, who roams. Orthogonal to role: role says what they may do, '
  'this says where.';

-- ------------------------------------------------------------
-- 3. Where a sale happened
-- ------------------------------------------------------------

alter table orders
  add column if not exists branch_id text not null default 'main'
    references branches(id);

comment on column orders.branch_id is
  'Which branch took this sale. Defaults to main so every order written '
  'before branches existed stays correct and no figure moves.';

/* Branch first, then date: every scoped query this column now serves asks
   for one branch over a range of days, which is exactly this index. */
create index if not exists orders_branch_date_idx
  on orders (branch_id, date desc);

-- ------------------------------------------------------------
-- 4. Who may ask about which branch
-- ------------------------------------------------------------

create or replace function viewer_branch()
returns text
language sql
security definer set search_path = public
stable
as $$
  select branch_id from profiles where id = auth.uid()
$$;

comment on function viewer_branch is
  'The branch this session is pinned to, or null for somebody who roams.';

create or replace function sees_branch(p_branch text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select is_staff() and (
    -- Not pinned: every branch. The owner, and anyone the owner leaves
    -- unpinned on purpose.
    (select branch_id from profiles where id = auth.uid()) is null
    -- Pinned: that one branch and no other.
    or (select branch_id from profiles where id = auth.uid()) = p_branch
  )
$$;

comment on function sees_branch is
  'May this session read and write rows belonging to that branch? The one '
  'question the branch dimension asks. It never decides WHAT may be done — '
  'that is the role, and it is a separate question with a separate answer.';

revoke all on function viewer_branch() from public;
revoke all on function sees_branch(text) from public;
grant execute on function viewer_branch(), sees_branch(text)
  to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. The guard learns branch_id
--
-- Re-created in full from its own source in 0077 with one line added.
-- A customer who can move their own order to another branch moves the money
-- with it: the takings of two places stop adding up, and the branch that
-- never made the sale carries it. Attribution is the shop's, like every
-- other column on this list.
-- ------------------------------------------------------------

create or replace function guard_order_money()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  changed text[] := '{}';
begin
  if auth.uid() is null or is_staff() or trusted_order_write() then
    return new;
  end if;

  if new.revenue        is distinct from old.revenue        then changed := array_append(changed, 'revenue'); end if;
  if new.discount       is distinct from old.discount       then changed := array_append(changed, 'discount'); end if;
  if new.promo_code     is distinct from old.promo_code     then changed := array_append(changed, 'promo_code'); end if;
  if new.cogs           is distinct from old.cogs           then changed := array_append(changed, 'cogs'); end if;
  if new.oe             is distinct from old.oe             then changed := array_append(changed, 'oe'); end if;
  if new.gross_profit   is distinct from old.gross_profit   then changed := array_append(changed, 'gross_profit'); end if;
  if new.net_profit     is distinct from old.net_profit     then changed := array_append(changed, 'net_profit'); end if;
  if new.payment_status is distinct from old.payment_status then changed := array_append(changed, 'payment_status'); end if;
  if new.payment_method is distinct from old.payment_method then changed := array_append(changed, 'payment_method'); end if;
  if new.payment_reference is distinct from old.payment_reference then changed := array_append(changed, 'payment_reference'); end if;
  if new.payment_receipt_url is distinct from old.payment_receipt_url then changed := array_append(changed, 'payment_receipt_url'); end if;
  if new.delivery_fee   is distinct from old.delivery_fee   then changed := array_append(changed, 'delivery_fee'); end if;
  if new.delivery_discount is distinct from old.delivery_discount then changed := array_append(changed, 'delivery_discount'); end if;
  if new.downpayment_amount is distinct from old.downpayment_amount then changed := array_append(changed, 'downpayment_amount'); end if;
  if new.downpayment_confirmed_at is distinct from old.downpayment_confirmed_at then changed := array_append(changed, 'downpayment_confirmed_at'); end if;
  if new.voided_at      is distinct from old.voided_at      then changed := array_append(changed, 'voided_at'); end if;
  if new.void_reason    is distinct from old.void_reason    then changed := array_append(changed, 'void_reason'); end if;
  if new.stock_applied_at is distinct from old.stock_applied_at then changed := array_append(changed, 'stock_applied_at'); end if;
  if new.fulfillment   is distinct from old.fulfillment   then changed := array_append(changed, 'fulfillment'); end if;
  if new.is_backfill   is distinct from old.is_backfill   then changed := array_append(changed, 'is_backfill'); end if;
  if new.shift_id      is distinct from old.shift_id      then changed := array_append(changed, 'shift_id'); end if;
  if new.logged_by     is distinct from old.logged_by     then changed := array_append(changed, 'logged_by'); end if;
  if new.tag           is distinct from old.tag           then changed := array_append(changed, 'tag'); end if;
  if new.eta_minutes   is distinct from old.eta_minutes   then changed := array_append(changed, 'eta_minutes'); end if;
  if new.eta_set_at    is distinct from old.eta_set_at    then changed := array_append(changed, 'eta_set_at'); end if;
  if new.eta_alerted_at is distinct from old.eta_alerted_at then changed := array_append(changed, 'eta_alerted_at'); end if;
  if new.notified_status is distinct from old.notified_status then changed := array_append(changed, 'notified_status'); end if;
  if new.paid_at       is distinct from old.paid_at       then changed := array_append(changed, 'paid_at'); end if;
  if new.payment_plan  is distinct from old.payment_plan  then changed := array_append(changed, 'payment_plan'); end if;
  if new.created_at    is distinct from old.created_at    then changed := array_append(changed, 'created_at'); end if;
  -- New in 0078. Moving an order to another branch moves the money with it.
  if new.branch_id     is distinct from old.branch_id     then changed := array_append(changed, 'branch_id'); end if;
  if new.ticket         is distinct from old.ticket         then changed := array_append(changed, 'ticket'); end if;
  if new.date           is distinct from old.date           then changed := array_append(changed, 'date'); end if;
  if new.customer_id    is distinct from old.customer_id    then changed := array_append(changed, 'customer_id'); end if;

  if array_length(changed, 1) > 0 then
    raise exception 'What an order costs is the shop''s to set, not the customer''s (tried to change: %)',
      array_to_string(changed, ', ')
      using errcode = '42501';
  end if;
  return new;
end $$;

select regrant_visible_columns();

-- ------------------------------------------------------------
-- 6. Every table has to say where it stands
--
-- The lesson of 0076 and 0077, applied before the mistake instead of after.
-- A branch column is a deny-list by another name: every table that does not
-- have one silently means "the whole business", which is right for the menu
-- and wrong for the cash drawer — and nothing announces which.
--
-- So every table in the schema is named in exactly one of three lists, and
-- the check below fails if one is in none. A table added next year is in no
-- list and fails on the day it is added.
--
-- `pending` is the honest part: these NEED a branch and do not have one yet,
-- because they land in later phases. Listing them is a to-do the database
-- enforces — the check fails if one of them quietly grows the column without
-- being moved to `scoped`, so the list cannot rot.
-- ------------------------------------------------------------

create or replace function branch_table_ledger()
returns table (tbl text, standing text)
language sql immutable
set search_path = public
as $$
  select t, 'scoped'::text from unnest(array[
    /* Rows that belong to one branch, and already say so. */
    'orders', 'profiles'
  ]) t
  union all
  select t, 'pending'::text from unnest(array[
    /* Rows that belong to one branch and do NOT yet say so. Each one is a
       later phase. Moving it to `scoped` is part of adding the column. */
    'cash_ledger', 'receivables',              -- the branch's own money
    'fixed_costs', 'monthly_bills',            -- its rent
    'running_costs', 'assets',                 -- its gas, its appliances
    'staff_shifts',                            -- who worked, where
    'waste_log', 'cycle_counts', 'consumption_log', -- its stock movement
    'shop_hours', 'shop_closures',             -- a food park keeps its own hours
    'payment_settings',                        -- its own GCash
    'activity_log'                             -- what happened, and where
  ]) t
  union all
  select t, 'shared'::text from unnest(array[
    /* One row serves the whole business, for a reason worth being able to
       state. Grouped by that reason. */

    -- The list of places itself.
    'branches',

    -- The commissary's catalogue. Recipes, costs and buying live at main by
    -- definition: that is what makes it the commissary, and a branch that
    -- could edit these could drift from the sauce it is actually sent.
    'ingredients', 'ingredient_lots', 'batches', 'batch_ingredients',
    'meals', 'meal_ingredients', 'meal_components', 'meal_packaging',
    'meal_modifier_groups', 'modifier_groups', 'modifier_options',
    'modifier_option_prices', 'product_modifier_groups',
    'menu_categories', 'menu_products', 'order_packaging',
    'suppliers', 'supplier_prices', 'supplier_debts', 'purchase_log',
    'oe_templates',

    -- Children of an order. The branch is on the parent; repeating it here
    -- would be a second answer to one question, and the two would disagree.
    'order_lines', 'order_line_extras',

    -- The shop talking to the public, in one voice, from one brand.
    'announcements', 'faq_entries', 'marketing_campaigns',
    'promos', 'promo_redemptions', 'reviews',
    'chat_threads', 'chat_messages', 'chat_settings',

    -- Settings that are the business's, not a place's.
    'settings', 'shop_settings', 'delivery_settings',

    -- Plumbing. Nothing here is a fact about trading.
    'device_sessions', 'push_subscriptions', 'error_log',
    'messenger_events', 'restore_snapshots'
  ]) t
$$;

comment on function branch_table_ledger is
  'Where every table stands on the branch question: scoped (has branch_id), '
  'pending (needs one, a later phase) or shared (one row serves the whole '
  'business). A table in no list fails the behaviour check below.';

-- ---------------------------------------------------------------
-- Behaviour checks
-- ---------------------------------------------------------------

do $$
declare
  v_missing text[] := '{}';
  v_wrong text[] := '{}';
  v_pending int;
  r record;
begin
  /* Every table stands somewhere. */
  for r in
    select c.table_name::text as t
      from information_schema.tables c
     where c.table_schema = 'public' and c.table_type = 'BASE TABLE'
  loop
    if not exists (select 1 from branch_table_ledger() l where l.tbl = r.t) then
      v_missing := array_append(v_missing, r.t);
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'FAIL: % is in no branch list. Every table must say whether its rows belong to one branch (scoped), will need to (pending), or serve the whole business (shared) — otherwise it silently means "all branches" and nobody finds out which figures were blended.',
      array_to_string(v_missing, ', ');
  end if;

  /* A list that has drifted from the schema is worse than no list.
     `scoped` must really have the column; `pending` must really not — so the
     day somebody adds branch_id to cash_ledger, this fails until the ledger
     above is updated too. */
  for r in select l.tbl, l.standing from branch_table_ledger() l loop
    if r.standing = 'scoped' and not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.tbl
         and column_name = 'branch_id'
    ) then
      v_wrong := array_append(v_wrong, r.tbl || ' is listed scoped but has no branch_id');
    end if;
    if r.standing = 'pending' and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.tbl
         and column_name = 'branch_id'
    ) then
      v_wrong := array_append(v_wrong, r.tbl || ' has branch_id but is still listed pending');
    end if;
  end loop;

  if array_length(v_wrong, 1) > 0 then
    raise exception 'FAIL: the branch ledger disagrees with the schema — %',
      array_to_string(v_wrong, '; ');
  end if;

  select count(*) into v_pending from branch_table_ledger() where standing = 'pending';
  raise notice 'OK: every table stands somewhere on the branch question (% still pending)', v_pending;
end $$;

do $$
declare
  v_id text;
begin
  /* One commissary. */
  begin
    insert into branches (id, name, is_main) values ('zz-second-main', 'ZZ', true);
    raise exception 'FAIL: a second main branch was allowed — the transfer model has no centre';
  exception
    when unique_violation then null;
  end;

  /* A sale lands at main unless told otherwise, so nothing written before
     branches existed moved. */
  insert into orders (date, revenue, status) values (current_date, 100, 'completed')
  returning id into v_id;
  if (select branch_id from orders where id = v_id) <> 'main' then
    raise exception 'FAIL: an order without a branch did not default to main';
  end if;

  /* And a branch nobody opened is refused. */
  begin
    update orders set branch_id = 'zz-nowhere' where id = v_id;
    raise exception 'FAIL: an order was filed against a branch that does not exist';
  exception
    when foreign_key_violation then null;
  end;

  delete from orders where id = v_id;
  raise notice 'OK: one commissary, orders default to main, and a branch must exist';
end $$;

do $$
declare
  v_id text;
  v_refused boolean := false;
begin
  /* A customer cannot move their own order to another branch.
     The money goes with it: two places stop adding up and the branch that
     never made the sale carries it. */
  insert into auth.users (id, email)
  values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'zz-branch-probe@x')
  on conflict do nothing;

  insert into orders (date, revenue, status, customer_id)
  values (current_date, 500, 'pending', 'ffffffff-ffff-ffff-ffff-ffffffffffff')
  returning id into v_id;

  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    update orders set branch_id = 'express-el-mercado' where id = v_id;
  exception
    when insufficient_privilege then v_refused := true;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if not v_refused then
    raise exception 'FAIL: a customer moved their own order to another branch';
  end if;

  delete from orders where id = v_id;
  raise notice 'OK: which branch took a sale is not the customer''s to rewrite';
end $$;

do $$
declare
  v_main boolean;
  v_other boolean;
begin
  /* The one question the branch dimension asks, answered for three people.

     Pinned staff see their own branch and no other; an unpinned member of
     staff (the owner) sees every branch; a customer sees none. Asserted
     rather than read off the function's source, because the whole account
     model rests on this one answer. */

  /* Both fixtures are created BEFORE anyone is impersonated, and that is
     load-bearing rather than tidy: a trigger refuses a role a signed-in
     session is not entitled to grant, so creating the second profile while
     still acting as the first one silently filed it as a customer. The
     check failed with role=customer, which is the role guard working
     exactly as it should. */
  perform set_config('request.jwt.claim.sub', '', true);

  insert into auth.users (id, email) values
    ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'zz-booth@x'),
    ('aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa', 'zz-roams@x')
  on conflict do nothing;

  insert into profiles (id, role, full_name, branch_id) values
    ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'staff', 'ZZ Booth', 'express-el-mercado'),
    ('aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa', 'owner', 'ZZ Roams', null)
  on conflict (id) do update
    set role = excluded.role, branch_id = excluded.branch_id;

  -- Someone who works at the booth: their own branch and no other.
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', true);
  select sees_branch('main'), sees_branch('express-el-mercado') into v_main, v_other;
  if v_main or not v_other then
    raise exception
      'FAIL: a member of staff pinned to the booth sees main=% express=% — pinned means one branch and no other',
      v_main, v_other;
  end if;

  -- Somebody who roams, pinned to nothing: every branch.
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa', true);
  select sees_branch('main'), sees_branch('express-el-mercado') into v_main, v_other;
  if not v_main or not v_other then
    raise exception 'FAIL: an unpinned owner cannot see every branch (main=% express=%)', v_main, v_other;
  end if;

  -- A customer, who works nowhere.
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', true);
  select sees_branch('main'), sees_branch('express-el-mercado') into v_main, v_other;
  if v_main or v_other then
    raise exception 'FAIL: a customer can see a branch';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  delete from profiles where id in (
    'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa', 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa');
  raise notice 'OK: pinned sees one, unpinned sees all, a customer sees none';
end $$;
