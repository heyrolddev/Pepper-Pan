-- Pepper Pan — the indexes four growing tables were missing, and one page
-- that was adding up every order it had ever taken
-- Run this once in the Supabase SQL Editor, after 0040.
--
-- Nothing here changes what the shop can do. It changes how long two screens
-- take once there is a year of trading behind them, which is the sort of
-- thing that is cheap now and awkward at ten thousand orders.

-- ============================================================
-- 1. Four indexes for four columns that are filtered on every visit
--
-- `consumption_log` is the fastest-growing table in the shop — a row per
-- ingredient per line sold — and the reorder suggestions read it by date with
-- nothing to look the date up by. The others are the same shape: a column the
-- code filters or sorts on, with no index behind it.
-- ============================================================
create index if not exists idx_consumption_log_date on consumption_log(date);
create index if not exists idx_waste_log_date on waste_log(date);
create index if not exists idx_waste_log_ingredient on waste_log(ingredient_id);

-- `at`, not `created_at`: this table has always called it `at`, and the staff
-- activity list sorts by it.
create index if not exists idx_activity_log_at on activity_log(at desc);

-- Every "which dishes actually sell" join reads order_lines by meal.
create index if not exists idx_order_lines_meal on order_lines(meal_id);

-- ============================================================
-- 2. Per-customer totals, worked out by the database
--
-- The Customers screen fetched EVERY order the shop had ever taken — no date
-- filter, no limit — and added them up in JavaScript to show each customer's
-- order count and lifetime spend. That is fine at five hundred orders and a
-- long wait at fifty thousand, and it did the same work again on every visit.
--
-- Postgres can group. One row per customer instead of one row per order.
--
-- `security_invoker = true` so the caller's own row-level security still
-- decides what goes into the total — the same choice `orders_for_staff` made
-- in 0021. Staff and the owner see every order and get real totals; a
-- customer who reached this would see only their own, which is harmless and
-- true; a signed-out visitor sees nothing at all.
--
-- `revenue` is deliberately the only money column here. cogs, gross_profit
-- and net_profit are walled off from browser sessions by the column grants in
-- 0021 and 0036, and a view is not a way around that.
-- ============================================================
create or replace view customer_order_stats
with (security_invoker = true)
as
  select
    customer_id,
    count(*)::int as order_count,
    count(*) filter (where status = 'completed')::int as completed_count,
    coalesce(sum(revenue) filter (where status = 'completed'), 0)::numeric as total_spent
  from orders
  where customer_id is not null
  group by customer_id;

grant select on customer_order_stats to authenticated;

comment on view customer_order_stats is
  'One row per customer: how many orders, how many completed, and lifetime spend on completed orders. Grouped in the database so the Customers screen does not have to read every order ever taken. Respects the caller''s RLS.';
