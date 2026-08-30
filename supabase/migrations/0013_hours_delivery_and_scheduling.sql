-- Pepper Pan — when the shop is open, where the order is, and when it's for
-- Run this once in the Supabase SQL Editor, after 0012.
--
-- Three gaps this closes:
--   1. The system had no idea when the shop was open. Orders could land at
--      3am and sit until morning, and the assistant had to tell people to
--      ring up and ask.
--   2. "Ready" and "the rider has left" were the same status, so a delivery
--      customer watched a finished countdown while their food was in transit.
--   3. Every order was for right now, which turned every party and bulk
--      order — the most valuable ones — into a phone call.

-- ============================================================
-- WHEN THE SHOP IS OPEN
--
-- One row per weekday, matching JavaScript's getDay(): 0 = Sunday.
-- Times are plain clock times read in Asia/Manila; storing them with a zone
-- would imply a precision the shop doesn't have and break on DST-free
-- Philippine time for no benefit.
-- ============================================================
create table if not exists shop_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  is_open boolean not null default true,
  opens time not null default '10:00',
  closes time not null default '21:00'
);

-- Sensible defaults so the shop is never accidentally "closed forever" the
-- moment this runs; the owner adjusts them in HQ.
insert into shop_hours (weekday) values (0),(1),(2),(3),(4),(5),(6)
  on conflict (weekday) do nothing;

-- Specific dates the shop isn't opening — a holiday, a family day, a day the
-- supplier didn't turn up. Beats editing the weekly hours and forgetting.
create table if not exists shop_closures (
  closed_on date primary key,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists shop_settings (
  id smallint primary key default 1 check (id = 1),
  -- The master switch: pull this and nothing can be ordered, whatever the
  -- clock says. For a sold-out evening or a broken fryer.
  accepting_orders boolean not null default true,
  -- Shown to customers when ordering is off, in the shop's own words.
  paused_message text,
  -- How far ahead an advance order must be placed, in hours.
  min_lead_hours smallint not null default 2 check (min_lead_hours between 0 and 168),
  -- How far ahead the shop will take one at all, in days.
  max_days_ahead smallint not null default 14 check (max_days_ahead between 1 and 90),
  updated_at timestamptz not null default now()
);

insert into shop_settings (id) values (1) on conflict (id) do nothing;

alter table shop_hours enable row level security;
alter table shop_closures enable row level security;
alter table shop_settings enable row level security;

-- Opening hours are the most public fact a shop has.
drop policy if exists "public_read_hours" on shop_hours;
create policy "public_read_hours" on shop_hours for select using (true);

drop policy if exists "public_read_closures" on shop_closures;
create policy "public_read_closures" on shop_closures for select using (true);

drop policy if exists "public_read_shop_settings" on shop_settings;
create policy "public_read_shop_settings" on shop_settings for select using (true);

drop policy if exists "staff_write_hours" on shop_hours;
create policy "staff_write_hours" on shop_hours for update
  using (is_staff()) with check (is_staff());

drop policy if exists "staff_insert_closures" on shop_closures;
create policy "staff_insert_closures" on shop_closures for insert with check (is_staff());

drop policy if exists "staff_delete_closures" on shop_closures;
create policy "staff_delete_closures" on shop_closures for delete using (is_staff());

drop policy if exists "staff_write_shop_settings" on shop_settings;
create policy "staff_write_shop_settings" on shop_settings for update
  using (is_staff()) with check (is_staff());

-- ============================================================
-- WHERE THE ORDER IS
--
-- 'out_for_delivery' sits between ready and completed. Pickup orders skip
-- it; for delivery it's the difference between "your food is done" and
-- "your food is on its way", which is the thing the customer is watching for.
-- ============================================================
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in (
    'pending', 'confirmed', 'preparing', 'ready',
    'out_for_delivery', 'completed', 'cancelled'
  ));

-- ============================================================
-- WHEN THE ORDER IS FOR
--
-- Null means "as soon as you can", which is what most orders are and what
-- every existing order was — so no backfill is needed.
-- ============================================================
alter table orders add column if not exists scheduled_for timestamptz;

create index if not exists idx_orders_scheduled
  on orders(scheduled_for) where scheduled_for is not null;

-- Remembers the last status a customer was actually told about, so a
-- notification can't be sent twice for the same step.
alter table orders add column if not exists notified_status text;
