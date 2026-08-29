-- Pepper Pan — delivery: shop location, distance-based fees, precise addresses
-- Run this once in the Supabase SQL Editor, after 0004.

-- ============================================================
-- DELIVERY SETTINGS — one row, owned by the shop.
-- Pricing works like the delivery apps: a base fee that covers the first
-- `base_km`, then a per-kilometre rate beyond that, clamped to `min_fee`,
-- refused past `max_km`, and waived when the food subtotal reaches
-- `free_over` (0 disables the waiver).
-- ============================================================
create table if not exists delivery_settings (
  id smallint primary key default 1 check (id = 1),
  is_enabled boolean not null default true,
  -- Defaults point at Apalit town centre; the owner drags the pin to the
  -- real shop on the admin page, which is what every distance is measured from.
  shop_lat double precision not null default 14.9508,
  shop_lng double precision not null default 120.7581,
  base_fee numeric not null default 30,
  base_km numeric not null default 2,
  per_km_fee numeric not null default 10,
  min_fee numeric not null default 30,
  max_km numeric not null default 10,
  free_over numeric not null default 0,
  notice text,
  updated_at timestamptz not null default now()
);

insert into delivery_settings (id) values (1) on conflict (id) do nothing;

alter table delivery_settings enable row level security;

-- Customers must be able to read this to see a fee before ordering.
drop policy if exists "public_read_delivery_settings" on delivery_settings;
create policy "public_read_delivery_settings" on delivery_settings
  for select using (true);

drop policy if exists "staff_write_delivery_settings" on delivery_settings;
create policy "staff_write_delivery_settings" on delivery_settings
  for update using (is_staff()) with check (is_staff());

-- ============================================================
-- ORDERS — where it goes, how far, and what that cost.
--
-- `revenue` deliberately keeps meaning *food subtotal*, exactly as it always
-- has, so every existing row and every sales figure on the dashboard stays
-- correct. The delivery fee is a separate column, and what the customer pays
-- is revenue + delivery_fee.
-- ============================================================
alter table orders add column if not exists delivery_address text;
alter table orders add column if not exists delivery_lat double precision;
alter table orders add column if not exists delivery_lng double precision;
alter table orders add column if not exists delivery_distance_km numeric;
alter table orders add column if not exists delivery_fee numeric not null default 0;

-- ============================================================
-- PROFILES — a saved pin, so a returning customer doesn't re-drop it.
-- ============================================================
alter table profiles add column if not exists address_lat double precision;
alter table profiles add column if not exists address_lng double precision;

-- The privilege guard rewrites NEW on every profile update, so it must not
-- clobber the columns a customer is allowed to set. It only ever clamped
-- role/is_verified/is_blocked, which is still all it clamps — re-created here
-- only so this migration is self-contained if run against an older database.
create or replace function guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not is_owner() then
    new.role := old.role;
    new.is_verified := old.is_verified;
    new.is_blocked := old.is_blocked;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
