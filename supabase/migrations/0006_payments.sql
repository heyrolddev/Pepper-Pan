-- Pepper Pan — payments: cash on delivery + manual GCash
-- Run this once in the Supabase SQL Editor, after 0005.
--
-- "Manual GCash" means the shop shows its GCash name/number/QR, the customer
-- pays in the GCash app, then submits the reference number (and optionally a
-- screenshot). Staff verify it against their own GCash records and mark the
-- order paid. No payment gateway, no merchant account, no per-transaction fee.

-- ============================================================
-- PAYMENT SETTINGS — one row, owned by the shop.
-- ============================================================
create table if not exists payment_settings (
  id smallint primary key default 1 check (id = 1),
  cod_enabled boolean not null default true,
  gcash_enabled boolean not null default false,
  gcash_name text,
  gcash_number text,
  gcash_qr_url text,
  instructions text,
  updated_at timestamptz not null default now()
);

insert into payment_settings (id) values (1) on conflict (id) do nothing;

alter table payment_settings enable row level security;

-- Customers must read this to see which methods exist and where to send money.
drop policy if exists "public_read_payment_settings" on payment_settings;
create policy "public_read_payment_settings" on payment_settings
  for select using (true);

drop policy if exists "staff_write_payment_settings" on payment_settings;
create policy "staff_write_payment_settings" on payment_settings
  for update using (is_staff()) with check (is_staff());

-- ============================================================
-- ORDERS — how it was paid, and whether that's been confirmed.
--
--   unpaid     nothing received yet (every COD order starts here)
--   submitted  customer says they've sent it, awaiting the shop's check
--   paid       the shop has confirmed the money arrived
--   refunded   sent back
-- ============================================================
alter table orders add column if not exists payment_status text not null default 'unpaid';
alter table orders add column if not exists payment_reference text;
alter table orders add column if not exists payment_receipt_url text;
alter table orders add column if not exists paid_at timestamptz;

do $$
begin
  alter table orders add constraint orders_payment_status_check
    check (payment_status in ('unpaid', 'submitted', 'paid', 'refunded'));
exception
  when duplicate_object then null;
end
$$;

create index if not exists idx_orders_payment_status on orders(payment_status);

-- ============================================================
-- Letting a customer submit a payment reference.
--
-- RLS gates whole rows, not columns, and the customer's update policy only
-- covers orders still 'pending' — but payment happens while the food is
-- already being cooked. Rather than widening that policy (which would also
-- let them edit the order after the kitchen started), this SECURITY DEFINER
-- function is the one narrow path: it proves ownership itself and writes
-- nothing but the payment columns.
-- ============================================================
create or replace function submit_payment_reference(
  p_order_id text,
  p_reference text,
  p_receipt_url text default null
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_payment_status text;
begin
  select customer_id, status, payment_status
    into v_owner, v_status, v_payment_status
  from orders where id = p_order_id;

  if v_owner is null or v_owner <> auth.uid() then
    return false;                       -- not yours (or a walk-in order)
  end if;
  if v_status = 'cancelled' then
    return false;                       -- nothing left to pay for
  end if;
  if v_payment_status = 'paid' then
    return false;                       -- already confirmed; don't let it be rewritten
  end if;

  update orders
     set payment_reference   = nullif(btrim(p_reference), ''),
         payment_receipt_url = coalesce(p_receipt_url, payment_receipt_url),
         payment_status      = 'submitted'
   where id = p_order_id;

  return true;
end;
$$;

revoke all on function submit_payment_reference(text, text, text) from public;
grant execute on function submit_payment_reference(text, text, text) to authenticated;
