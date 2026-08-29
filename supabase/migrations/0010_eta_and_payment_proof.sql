-- Pepper Pan — ETA countdown + accept a receipt screenshot as payment proof
-- Run this once in the Supabase SQL Editor, after 0009.

-- ============================================================
-- When the ETA was promised.
--
-- The customer's countdown has to run from the moment staff set the ETA, not
-- from page load — otherwise reloading restarts the clock and "20 minutes"
-- never actually elapses. `updated_at` can't serve: it moves on every status
-- change, which would silently reset the timer mid-cook.
-- ============================================================
alter table orders add column if not exists eta_set_at timestamptz;

-- ============================================================
-- Payment proof: a reference number OR a receipt screenshot.
--
-- Previously the reference was mandatory and the screenshot optional. Reading
-- a GCash reference off a phone is error-prone, and a screenshot is often the
-- easier and more convincing proof — so either satisfies the shop, but at
-- least one is still required. The check lives here as well as in the UI so a
-- blank submission can't reach the orders queue.
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
  v_existing_receipt text;
  v_reference text := nullif(btrim(p_reference), '');
begin
  select customer_id, status, payment_status, payment_receipt_url
    into v_owner, v_status, v_payment_status, v_existing_receipt
  from orders where id = p_order_id;

  if v_owner is null or v_owner <> auth.uid() then
    return false;                            -- not yours (or a walk-in order)
  end if;
  if v_status = 'cancelled' then
    return false;                            -- nothing left to pay for
  end if;
  if v_payment_status in ('partial', 'paid') then
    return false;                            -- already confirmed by the shop
  end if;

  -- At least one form of proof, counting a screenshot already on file.
  if v_reference is null
     and p_receipt_url is null
     and v_existing_receipt is null then
    return false;
  end if;

  update orders
     set payment_reference   = coalesce(v_reference, payment_reference),
         payment_receipt_url = coalesce(p_receipt_url, payment_receipt_url),
         payment_status      = 'submitted'
   where id = p_order_id;

  return true;
end;
$$;

revoke all on function submit_payment_reference(text, text, text) from public;
grant execute on function submit_payment_reference(text, text, text) to authenticated;
