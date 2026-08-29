-- Pepper Pan — record when a down payment was confirmed
-- Run this once in the Supabase SQL Editor, after 0007.
--
-- `paid_at` only marks an order settled in full. A part-paid order needs its
-- own timestamp, so the customer can be shown "your ₱276 was confirmed at
-- 2:15pm" rather than a state that looks identical to still-waiting.

alter table orders add column if not exists downpayment_confirmed_at timestamptz;

-- ============================================================
-- Close a hole in submit_payment_reference: it refused to overwrite a 'paid'
-- order, but not a 'partial' one — so after the shop confirmed a down
-- payment, the customer could re-submit a reference and knock the order back
-- to 'submitted', undoing the shop's decision. Once money has been confirmed
-- as received, in part or in full, the reference is the shop's record.
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
    return false;                            -- not yours (or a walk-in order)
  end if;
  if v_status = 'cancelled' then
    return false;                            -- nothing left to pay for
  end if;
  if v_payment_status in ('partial', 'paid') then
    return false;                            -- already confirmed by the shop
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
