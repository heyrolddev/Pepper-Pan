-- Pepper Pan — part-payment (down payment) on GCash
-- Run this once in the Supabase SQL Editor, after 0006.
--
-- A customer paying by GCash may send a percentage up front instead of the
-- whole total, settling the balance in cash on handover. Besides being easier
-- on the customer, a real transfer before cooking is the shop's protection
-- against made-up orders.

-- ============================================================
-- PAYMENT SETTINGS — offer it, and at what percentage.
-- ============================================================
alter table payment_settings
  add column if not exists downpayment_enabled boolean not null default false;
alter table payment_settings
  add column if not exists downpayment_percent numeric not null default 50;

do $$
begin
  alter table payment_settings add constraint payment_settings_downpayment_percent_check
    check (downpayment_percent > 0 and downpayment_percent < 100);
exception
  when duplicate_object then null;
end
$$;

-- ============================================================
-- ORDERS — which plan, and how much was asked for up front.
--
-- `downpayment_amount` is what the customer was told to send now. The balance
-- is always (revenue + delivery_fee) - downpayment_amount, derived rather
-- than stored, so it can never drift out of step with an edited order.
-- ============================================================
alter table orders add column if not exists payment_plan text not null default 'full';
alter table orders add column if not exists downpayment_amount numeric not null default 0;

do $$
begin
  alter table orders add constraint orders_payment_plan_check
    check (payment_plan in ('full', 'downpayment'));
exception
  when duplicate_object then null;
end
$$;

-- ============================================================
-- A fifth payment state: the down payment landed, the rest is owed on
-- handover. Distinct from 'paid' so the shop never hands over food believing
-- an order is settled when half of it isn't.
-- ============================================================
alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'submitted', 'partial', 'paid', 'refunded'));
