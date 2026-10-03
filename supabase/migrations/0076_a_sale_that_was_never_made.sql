/*
 * A ticket that should never have existed.
 *
 * The shop had one way out of an order — cancel it — so two completely
 * different events were written to the same row and counted in the same
 * figure:
 *
 *   a cancellation   a real order, really wanted, that fell through
 *   a void           a keying mistake; nobody ever wanted that food
 *
 * The cancel reason list already carried "Rung up wrong" and "Duplicate
 * order", which is the system admitting the problem in its own words. Both
 * landed in the cancellation rate, so a cashier who double-punched a ticket
 * made the kitchen look like it had let a customer down. That figure is read
 * as a service problem. A fat-fingered till is not one.
 *
 * ── Why a void is still `status = 'cancelled'` underneath ────────────────
 *
 * This is the decision that matters, and it was made the safe way round.
 *
 * Twenty-eight queries in this codebase keep a cancelled order out of
 * revenue, stock, the takings, the forecast and the reports — most as
 * `.neq("status", "cancelled")`, which no compiler checks. A brand new
 * 'voided' status would have to be added to all twenty-eight, and the one
 * that got missed would count a voided ₱500 ticket as real money.
 *
 * A void keeps the arithmetic of a cancellation, so all twenty-eight are
 * already right with no edit, and adds a MARK that only the places COUNTING
 * cancellations need to read. The worst a missed site can do is call a void
 * a cancellation in a tally; nothing can turn it back into money.
 *
 * Safe by default. The failure mode is a label, not a peso.
 */

-- ------------------------------------------------------------
-- 1. The mark
-- ------------------------------------------------------------

alter table orders
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

comment on column orders.voided_at is
  'Stamped when a ticket is struck out as a mistake rather than called off. '
  'The row stays cancelled — that is what keeps it out of every money query '
  'already written — and this is what keeps it out of the cancellation rate.';

comment on column orders.void_reason is
  'Why the entry was wrong. Required whenever voided_at is set: a ticket '
  'that vanishes from the takings with no note is the one nobody can '
  'explain at closing.';

/* The two can never disagree.
   A void that is not cancelled would be a live order the reports have
   quietly stopped counting — money missing from the day with the order
   still on the board. The constraint is what makes "a void is a
   cancellation" true in the database rather than merely true in the
   action that happens to write it. */
alter table orders drop constraint if exists orders_void_is_cancelled;
alter table orders
  add constraint orders_void_is_cancelled
  check (voided_at is null or status = 'cancelled');

/* And a void always says why. */
alter table orders drop constraint if exists orders_void_has_a_reason;
alter table orders
  add constraint orders_void_has_a_reason
  check (voided_at is null or nullif(btrim(void_reason), '') is not null);

/* Reading the voids is a date-range question over a sparse set of rows, so
   a partial index is the whole of what is wanted and costs nothing on the
   overwhelming majority of orders that were never voided. */
create index if not exists orders_voided_at_idx
  on orders (voided_at desc) where voided_at is not null;

-- ------------------------------------------------------------
-- 2. The guard learns both columns
--
-- Re-created in full from its own source in 0075 with two lines added,
-- rather than patched, because a trigger function cannot be altered a line
-- at a time and a half-rewritten guard is worse than none.
--
-- These two are not decoration. A signed-in customer who can stamp
-- `voided_at` on their own pending order strikes their own bill out of the
-- shop's takings and keeps the food. It is the cheapest free meal in the
-- schema, and a deny-list protects nothing it does not name.
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
  if new.delivery_discount is distinct from old.delivery_discount then changed := array_append(changed, 'delivery_discount'); end if;
  if new.downpayment_amount is distinct from old.downpayment_amount then changed := array_append(changed, 'downpayment_amount'); end if;
  if new.downpayment_confirmed_at is distinct from old.downpayment_confirmed_at then changed := array_append(changed, 'downpayment_confirmed_at'); end if;
  -- New in 0076. Striking a ticket out of the takings is the shop's to do,
  -- and only the shop's.
  if new.voided_at      is distinct from old.voided_at      then changed := array_append(changed, 'voided_at'); end if;
  if new.void_reason    is distinct from old.void_reason    then changed := array_append(changed, 'void_reason'); end if;
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

-- ------------------------------------------------------------
-- 3. Let the customer SEE it on their own order
--
-- Column privileges on `orders` are granted one column at a time, so a
-- column added afterwards is readable by nobody until the grant is re-run.
-- A customer whose order the shop struck out should be told so on their own
-- tracker; what stays behind the wall is what the shop paid and earned,
-- which is a different question.
-- ------------------------------------------------------------

select regrant_visible_columns();

-- ------------------------------------------------------------
-- Behaviour checks
-- ------------------------------------------------------------

do $$
declare
  v_id text;
begin
  -- A void must be a cancellation.
  insert into orders (date, revenue, status) values (current_date, 100, 'completed')
  returning id into v_id;
  begin
    update orders set voided_at = now(), void_reason = 'ZZ' where id = v_id;
    raise exception 'FAIL: a completed order was voided — the money queries would still count it';
  exception
    when check_violation then null;
  end;

  -- And a void must say why.
  update orders set status = 'cancelled' where id = v_id;
  begin
    update orders set voided_at = now() where id = v_id;
    raise exception 'FAIL: a ticket was struck out of the takings with no reason recorded';
  exception
    when check_violation then null;
  end;
  begin
    update orders set voided_at = now(), void_reason = '   ' where id = v_id;
    raise exception 'FAIL: whitespace passed as a void reason';
  exception
    when check_violation then null;
  end;

  -- With both, it goes through.
  update orders set voided_at = now(), void_reason = 'Rung up wrong' where id = v_id;

  /* And it cannot then be un-cancelled while still carrying the mark.
     This is the case that would otherwise bite: moving a voided order back
     to 'completed' without clearing the stamp leaves a live order the
     reports have stopped counting. The constraint refuses, which is what
     forces `setOrderStatus` to clear both. */
  begin
    update orders set status = 'completed' where id = v_id;
    raise exception 'FAIL: a voided ticket was put back on the board with its void mark still on it';
  exception
    when check_violation then null;
  end;

  -- Clearing the mark in the same write is the way back.
  update orders set status = 'completed', voided_at = null, void_reason = null
   where id = v_id;

  delete from orders where id = v_id;
  raise notice 'OK: a void is a cancellation, it says why, and un-voiding clears the mark';
end $$;

do $$
declare
  v_named boolean;
begin
  /* The guard must NAME both columns.

     `guard_order_money` is a deny-list: it refuses only what it mentions.
     A customer who can stamp `voided_at` on their own order strikes their
     own bill out of the shop's takings and keeps the food — the cheapest
     free meal in the schema. Reading the function's own source is the only
     way to know the lines survived; a later edit re-creating the guard from
     an older copy would drop them silently and nothing else would notice. */
  select pg_get_functiondef(p.oid) like '%voided_at%'
     and pg_get_functiondef(p.oid) like '%void_reason%'
    into v_named
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'guard_order_money' and n.nspname = 'public'
   limit 1;

  if v_named is distinct from true then
    raise exception
      'FAIL: guard_order_money does not name voided_at and void_reason, so a signed-in customer can void their own bill and keep the food';
  end if;

  raise notice 'OK: the money guard names the void columns';
end $$;

do $$
declare
  v_id text;
  v_refused boolean := false;
begin
  /* The guard, exercised rather than read.

     The check above proves the function MENTIONS the columns. This proves
     the refusal actually fires for a real signed-in customer on their own
     pending order, which is the thing that matters. */
  insert into auth.users (id, email)
  values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'zz-void-probe@x')
  on conflict do nothing;

  insert into orders (date, revenue, status, customer_id)
  values (current_date, 100, 'pending', 'dddddddd-dddd-dddd-dddd-dddddddddddd')
  returning id into v_id;

  perform set_config('request.jwt.claim.sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    update orders set voided_at = now(), void_reason = 'free lunch' where id = v_id;
  exception
    when insufficient_privilege then v_refused := true;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if not v_refused then
    raise exception 'FAIL: a signed-in customer voided their own order';
  end if;

  delete from orders where id = v_id;
  raise notice 'OK: a customer cannot strike their own ticket out of the takings';
end $$;
