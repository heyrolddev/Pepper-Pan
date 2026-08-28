-- Pepper Pan — initial schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query → paste → Run).

create extension if not exists pgcrypto;

-- ============================================================
-- PROFILES (extends auth.users with a role)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('owner', 'staff', 'customer')),
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- Every new auth.users row gets a profile automatically, defaulting to 'customer'.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Helper used throughout RLS policies below.
create or replace function is_staff()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('owner', 'staff')
  );
$$;

create or replace function is_owner()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

-- ============================================================
-- INVENTORY
-- ============================================================
create table if not exists ingredients (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  unit text not null,
  purchase_price numeric not null default 0,
  purchase_qty numeric not null default 0,
  categories text[] not null default '{}',
  cost numeric not null default 0,
  stock numeric not null default 0,
  reorder numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists ingredient_lots (
  id text primary key default gen_random_uuid()::text,
  ingredient_id text not null references ingredients(id) on delete cascade,
  qty numeric not null,
  cost numeric not null default 0,
  received_date date,
  expiry_date date
);
create index if not exists idx_ingredient_lots_ingredient on ingredient_lots(ingredient_id);

create table if not exists purchase_log (
  id text primary key default gen_random_uuid()::text,
  ingredient_id text not null references ingredients(id) on delete cascade,
  lot_id text,
  date date not null default current_date,
  supplier text,
  qty numeric not null,
  cost numeric not null
);
create index if not exists idx_purchase_log_ingredient on purchase_log(ingredient_id);

create table if not exists consumption_log (
  id text primary key default gen_random_uuid()::text,
  ingredient_id text not null references ingredients(id) on delete cascade,
  date date not null default current_date,
  qty numeric not null,
  type text
);
create index if not exists idx_consumption_log_ingredient on consumption_log(ingredient_id);

-- ============================================================
-- BATCHES (bulk recipes & repack packs)
-- ============================================================
create table if not exists batches (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  yield_qty numeric not null default 0,
  yield_unit text not null default 'g',
  batch_stock numeric not null default 0,
  reorder_level numeric not null default 0,
  manual_cost_per_unit numeric, -- set for repack-only "packs" with no fixed recipe
  created_at timestamptz not null default now()
);

create table if not exists batch_ingredients (
  id bigserial primary key,
  batch_id text not null references batches(id) on delete cascade,
  ingredient_id text not null references ingredients(id),
  qty numeric not null
);
create index if not exists idx_batch_ingredients_batch on batch_ingredients(batch_id);

-- ============================================================
-- MEALS (menu items)
-- ============================================================
create table if not exists meals (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  price numeric not null default 0,
  kind text not null default 'single' check (kind in ('single', 'combo')),
  categories text[] not null default '{}',
  description text,
  image_url text,
  is_public boolean not null default true, -- shown on the customer-facing menu
  is_available boolean not null default true, -- temporarily 86'd
  created_at timestamptz not null default now()
);

create table if not exists meal_ingredients (
  id bigserial primary key,
  meal_id text not null references meals(id) on delete cascade,
  ref_type text not null check (ref_type in ('inv', 'batch')),
  ref_id text not null,
  qty numeric not null
);
create index if not exists idx_meal_ingredients_meal on meal_ingredients(meal_id);

create table if not exists meal_components (
  id bigserial primary key,
  meal_id text not null references meals(id) on delete cascade, -- the combo
  component_meal_id text not null references meals(id),
  qty numeric not null
);
create index if not exists idx_meal_components_meal on meal_components(meal_id);

-- ============================================================
-- ORDERS (customer-facing ordering + staff daily sales log)
-- ============================================================
create table if not exists orders (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  date date not null default current_date,
  customer_id uuid references auth.users(id), -- null = walk-in entered by staff
  logged_by text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  fulfillment text not null default 'pickup' check (fulfillment in ('pickup', 'delivery')),
  payment_method text not null default 'cod',
  contact_name text,
  contact_phone text,
  notes text,
  tag text,
  revenue numeric not null default 0,
  cogs numeric not null default 0,
  oe numeric not null default 0,
  gross_profit numeric not null default 0,
  net_profit numeric not null default 0
);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_date on orders(date);

create table if not exists order_lines (
  id bigserial primary key,
  order_id text not null references orders(id) on delete cascade,
  meal_id text not null references meals(id),
  qty numeric not null,
  price_at_sale numeric not null
);
create index if not exists idx_order_lines_order on order_lines(order_id);

-- ============================================================
-- WASTE / INTERNAL USE
-- ============================================================
create table if not exists waste_log (
  id text primary key default gen_random_uuid()::text,
  date date not null default current_date,
  ingredient_id text references ingredients(id),
  qty numeric not null,
  unit text,
  reason text,
  cost_at_time numeric,
  total_cost numeric,
  category text default 'internal',
  source_type text check (source_type in ('inv', 'batch')),
  source_id text,
  source_name text,
  note text,
  logged_by text
);

-- ============================================================
-- FINANCE
-- ============================================================
create table if not exists cash_ledger (
  id text primary key default gen_random_uuid()::text,
  date date not null default current_date,
  type text not null,
  amount numeric not null,
  note text,
  logged_by text
);

create table if not exists receivables (
  id text primary key default gen_random_uuid()::text,
  date date not null default current_date,
  customer text,
  amount numeric not null,
  collected boolean not null default false,
  note text
);

create table if not exists oe_templates (
  id text primary key default gen_random_uuid()::text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists cycle_counts (
  id text primary key default gen_random_uuid()::text,
  date date not null default current_date,
  payload jsonb not null default '{}'::jsonb
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
create table if not exists activity_log (
  id text primary key default gen_random_uuid()::text,
  at timestamptz not null default now(),
  date date not null default current_date,
  category text,
  description text not null,
  undoable boolean not null default false,
  undone boolean not null default false,
  undo_type text,
  undo_data jsonb,
  actor uuid references auth.users(id)
);

-- ============================================================
-- SETTINGS (single row, business-wide — no PIN storage; auth handles access now)
-- ============================================================
create table if not exists settings (
  id smallint primary key default 1 check (id = 1),
  open_days_per_month int not null default 26,
  cash_reserve numeric not null default 0,
  promo_tags text[] not null default '{}',
  cash_balance_enabled boolean not null default false,
  cash_balance_starting_amount numeric not null default 0,
  cash_balance_start_date date,
  logged_by_names text[] not null default '{}',
  last_backup_date timestamptz
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table ingredients enable row level security;
alter table ingredient_lots enable row level security;
alter table purchase_log enable row level security;
alter table consumption_log enable row level security;
alter table batches enable row level security;
alter table batch_ingredients enable row level security;
alter table meals enable row level security;
alter table meal_ingredients enable row level security;
alter table meal_components enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table waste_log enable row level security;
alter table cash_ledger enable row level security;
alter table receivables enable row level security;
alter table oe_templates enable row level security;
alter table cycle_counts enable row level security;
alter table activity_log enable row level security;
alter table settings enable row level security;

-- Profiles: everyone can read their own; owners can read/update everyone's (to promote staff).
create policy "profiles_select_own" on profiles for select using (id = auth.uid() or is_owner());
create policy "profiles_update_own" on profiles for update using (id = auth.uid() or is_owner());
create policy "profiles_owner_manage" on profiles for insert with check (is_owner());

-- Back-office data: staff/owner only, full access.
create policy "staff_all_ingredients" on ingredients for all using (is_staff()) with check (is_staff());
create policy "staff_all_ingredient_lots" on ingredient_lots for all using (is_staff()) with check (is_staff());
create policy "staff_all_purchase_log" on purchase_log for all using (is_staff()) with check (is_staff());
create policy "staff_all_consumption_log" on consumption_log for all using (is_staff()) with check (is_staff());
create policy "staff_all_batches" on batches for all using (is_staff()) with check (is_staff());
create policy "staff_all_batch_ingredients" on batch_ingredients for all using (is_staff()) with check (is_staff());
create policy "staff_all_meal_ingredients" on meal_ingredients for all using (is_staff()) with check (is_staff());
create policy "staff_all_meal_components" on meal_components for all using (is_staff()) with check (is_staff());
create policy "staff_all_waste_log" on waste_log for all using (is_staff()) with check (is_staff());
create policy "staff_all_cash_ledger" on cash_ledger for all using (is_staff()) with check (is_staff());
create policy "staff_all_receivables" on receivables for all using (is_staff()) with check (is_staff());
create policy "staff_all_oe_templates" on oe_templates for all using (is_staff()) with check (is_staff());
create policy "staff_all_cycle_counts" on cycle_counts for all using (is_staff()) with check (is_staff());
create policy "staff_all_activity_log" on activity_log for all using (is_staff()) with check (is_staff());
create policy "staff_all_settings" on settings for all using (is_staff()) with check (is_staff());

-- Meals: public can view available, public menu items; staff/owner see and manage everything.
create policy "public_select_meals" on meals for select
  using (is_public = true and is_available = true or is_staff());
create policy "staff_write_meals" on meals for insert with check (is_staff());
create policy "staff_update_meals" on meals for update using (is_staff()) with check (is_staff());
create policy "staff_delete_meals" on meals for delete using (is_staff());

-- Orders: customers manage their own; staff/owner manage all.
create policy "customer_select_own_orders" on orders for select
  using (customer_id = auth.uid() or is_staff());
create policy "customer_insert_own_orders" on orders for insert
  with check (customer_id = auth.uid() or is_staff());
create policy "customer_update_own_orders" on orders for update
  using (is_staff() or (customer_id = auth.uid() and status = 'pending'))
  with check (is_staff() or (customer_id = auth.uid() and status = 'pending'));
create policy "staff_delete_orders" on orders for delete using (is_staff());

create policy "select_own_order_lines" on order_lines for select
  using (
    is_staff() or exists (
      select 1 from orders o where o.id = order_lines.order_id and o.customer_id = auth.uid()
    )
  );
create policy "insert_own_order_lines" on order_lines for insert
  with check (
    is_staff() or exists (
      select 1 from orders o where o.id = order_lines.order_id and o.customer_id = auth.uid()
    )
  );
create policy "staff_manage_order_lines" on order_lines for update using (is_staff()) with check (is_staff());
create policy "staff_delete_order_lines" on order_lines for delete using (is_staff());
