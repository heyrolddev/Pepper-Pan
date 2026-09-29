-- ============================================================
-- 0066 — the bill is not the customer's to write
--
-- WHAT WAS FOUND
--
-- A signed-in customer could rewrite the money on their own pending order
-- straight from the browser. Proved against a real Postgres, not guessed:
--
--   update orders set revenue = 1, discount = 499 where id = '<mine>';
--   -->  revenue=1, discount=499, promo_code='I MADE THIS UP'
--
--   update orders set payment_status = 'paid' where id = '<mine>';
--   -->  payment_status = paid
--
-- A ₱500 order becomes a ₱1 order, and an unpaid one marks itself settled.
-- Nothing in the shop says a word.
--
-- WHY IT WAS INVISIBLE
--
-- Every server action is careful. `updateMyOrder` even says so: "prices are
-- re-read from the menu server-side and the order total recomputed here, so
-- a tampered client can't set its own total". That is true of the action —
-- and the action is not the only door. The browser holds the anon key by
-- design, the table and column names ship in the bundle, and RLS was the
-- only thing standing at the other door. RLS said: this row is yours and it
-- is still pending, so write to it. It has no opinion about WHICH COLUMNS.
--
-- That is the gap. A policy answers "whose row"; nothing answered "whose
-- number". Reviewing the server actions could never have found it, because
-- the server actions are not where it is.
--
-- WHY A TRIGGER AND NOT A GRANT
--
-- Column-level UPDATE grants were the obvious tool and they do not work
-- here: staff and customers are the SAME Postgres role (`authenticated`).
-- The difference between them lives in `is_staff()`, which a grant cannot
-- see. A trigger can.
--
-- WHO IS GUARDED
--
-- Only a signed-in non-staff session. The service role carries no JWT, so
-- `auth.uid()` is null and every server action passes straight through.
-- Staff pass because `is_staff()` says so. An anonymous session never gets
-- this far — RLS already requires the order to be theirs, and nobody's row
-- belongs to nobody.
-- ============================================================

/* One place to say "this write is the shop's own, let it by".
   `submit_payment_reference` is the single customer-facing function with a
   legitimate reason to touch a payment column, and it is re-created below
   to raise this flag. `true` scopes it to the transaction, so it cannot
   leak into the next statement on a pooled connection. */
create or replace function trusted_order_write() returns boolean
language sql stable as $$
  select coalesce(current_setting('pepperpan.trusted_order_write', true), '') = 'on'
$$;

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

  -- Named one by one rather than compared as a whole row, so the refusal
  -- can say WHICH column was being rewritten. "Permission denied" over a
  -- legitimate edit is a support message somebody has to answer by hand.
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
  if new.downpayment_amount is distinct from old.downpayment_amount then changed := array_append(changed, 'downpayment_amount'); end if;
  if new.downpayment_confirmed_at is distinct from old.downpayment_confirmed_at then changed := array_append(changed, 'downpayment_confirmed_at'); end if;
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

drop trigger if exists guard_order_money on orders;
create trigger guard_order_money
  before update on orders
  for each row execute function guard_order_money();

comment on function guard_order_money is
  'Refuses a signed-in non-staff session that tries to rewrite the money on '
  'an order. RLS answers "whose row"; this answers "whose number".';

-- ------------------------------------------------------------
-- The same hole, one level down
--
-- `revenue` is rebuilt from `order_lines.price_at_sale` when a customer
-- edits a pending order. Guarding the total and leaving the prices it is
-- computed from writable would move the exploit rather than close it: set
-- every line to ₱1, nudge a quantity, and the server recomputes the bill
-- down for you — through the legitimate action, with no tampering visible
-- anywhere.
--
-- A customer edit changes `qty` and nothing else. Inserting a line is the
-- checkout's job, and the checkout writes as the service role from 0066
-- onward, so a browser has no business inserting one at all.
-- ------------------------------------------------------------
create or replace function guard_order_line_prices()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or is_staff() or trusted_order_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'An order''s items are added at checkout, not one at a time'
      using errcode = '42501';
  end if;

  if new.price_at_sale is distinct from old.price_at_sale
     or new.meal_id is distinct from old.meal_id
     or new.order_id is distinct from old.order_id then
    raise exception 'What an item costs is the shop''s to set, not the customer''s'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_order_line_prices on order_lines;
create trigger guard_order_line_prices
  before insert or update on order_lines
  for each row execute function guard_order_line_prices();

/* And the add-ons, which carry their own prices for the same reason. */
create or replace function guard_order_extra_prices()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null or is_staff() or trusted_order_write() then
    return new;
  end if;
  raise exception 'Add-ons are priced at checkout, not in the browser'
    using errcode = '42501';
end $$;

drop trigger if exists guard_order_extra_prices on order_line_extras;
create trigger guard_order_extra_prices
  before insert or update on order_line_extras
  for each row execute function guard_order_extra_prices();

-- ------------------------------------------------------------
-- The one customer-facing write that is allowed to touch payment
--
-- Re-created unchanged apart from the flag. Its own rules are the reason it
-- is trusted: it proves the order is the caller's, refuses a cancelled one,
-- refuses one the shop has already confirmed, demands a reference or a
-- screenshot, and writes 'submitted' — never 'paid'. Only the shop marks an
-- order paid, which is the whole point of the guard above.
-- ------------------------------------------------------------
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

  perform set_config('pepperpan.trusted_order_write', 'on', true);

  update orders
     set payment_reference   = coalesce(v_reference, payment_reference),
         payment_receipt_url = coalesce(p_receipt_url, payment_receipt_url),
         payment_status      = 'submitted'
   where id = p_order_id;

  perform set_config('pepperpan.trusted_order_write', 'off', true);

  return true;
end;
$$;

revoke all on function submit_payment_reference(text, text, text) from public;
grant execute on function submit_payment_reference(text, text, text) to authenticated;
