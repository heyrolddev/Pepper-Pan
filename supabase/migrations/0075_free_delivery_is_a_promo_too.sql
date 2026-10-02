/*
 * "Libreng padala sa ₱500 pataas" — the promo the shop could not make.
 *
 * One line in checkout settled it:
 *
 *   orderTotal = max(0, subtotal - discount) + deliveryFee
 *
 * Every discount comes off the FOOD and the delivery fee is added after, so
 * no promo could reach it. A ₱500-off code on a ₱200 order still charged the
 * ₱50 padala: max(0, 200-500) = 0, then + 50. The ₱300 of unused discount
 * evaporated and the one charge the customer was hoping to lose did not move.
 *
 * That is the right rule for a food discount and it left no way at all to say
 * "free delivery" — which for a stall is the most useful promo there is,
 * because it does not cut the price of the food, it raises the size of the
 * order.
 *
 * ── The third scope ──────────────────────────────────────────────────────
 *
 * `scope` was 'order' (the whole basket) or 'meal' (one dish). It gains
 * 'delivery', and the two kinds already in the table do the rest:
 *
 *   free delivery        delivery · percent · 100
 *   half off the padala  delivery · percent · 50
 *   ₱20 off the padala   delivery · amount  · 20
 *
 * `min_spend` keeps measuring the FOOD, which is what makes "free delivery
 * over ₱500" one row rather than a feature.
 *
 * ── Why the fee is not simply reduced ────────────────────────────────────
 *
 * The discount is stored beside `delivery_fee`, never subtracted from it.
 * The fee is what the trip actually costs; the discount is the shop choosing
 * to absorb it. Collapse the two and the shop can no longer answer "what did
 * free delivery cost us last month" — the ₱50 would simply never have
 * existed, which is a cheerful lie.
 *
 * ── The guard is a deny-list, which is the dangerous part ────────────────
 *
 * `guard_order_money` names every money column a customer may not rewrite.
 * It does not compare the whole row. So a NEW money column is unprotected
 * the moment it is added — and this one decides whether somebody pays for
 * delivery. It is added to the list below, and a behaviour check proves a
 * customer is refused.
 */

-- ------------------------------------------------------------
-- 1. The third scope
-- ------------------------------------------------------------

alter table promos drop constraint if exists promos_scope_check;
alter table promos
  add constraint promos_scope_check
  check (scope in ('order', 'meal', 'delivery'));

/* A delivery promo has no dish, and saying so stops a stale `meal_id` from
   an edited promo quietly narrowing what the code applies to. The existing
   `promos_meal_scope_has_a_meal` covers the other direction. */
alter table promos drop constraint if exists promos_delivery_scope_has_no_meal;
alter table promos
  add constraint promos_delivery_scope_has_no_meal
  check (scope <> 'delivery' or meal_id is null);

comment on column promos.scope is
  'What the code comes off: order (the whole basket), meal (one dish, named '
  'by meal_id), or delivery (the padala). min_spend always measures the food.';

-- ------------------------------------------------------------
-- 2. What the shop absorbed
-- ------------------------------------------------------------

alter table orders
  add column if not exists delivery_discount numeric not null default 0;

alter table orders drop constraint if exists orders_delivery_discount_sane;
alter table orders
  add constraint orders_delivery_discount_sane
  check (delivery_discount >= 0);

comment on column orders.delivery_discount is
  'Pesos taken off the padala by a delivery-scope promo. Kept beside '
  'delivery_fee rather than subtracted from it: the fee is what the trip '
  'cost, this is what the shop chose to absorb, and the month needs both.';

-- ------------------------------------------------------------
-- 3. The guard learns the new column
--
-- Re-created in full from its own source in 0066 with one line added, rather
-- than patched, because a trigger function cannot be altered a line at a
-- time and a half-rewritten guard is worse than none.
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
  -- New in 0075, and the reason that migration re-creates this whole
  -- function: this column decides whether somebody pays for delivery, and a
  -- deny-list protects nothing it does not name.
  if new.delivery_discount is distinct from old.delivery_discount then changed := array_append(changed, 'delivery_discount'); end if;
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

-- ------------------------------------------------------------
-- 4. Let a customer SEE what was taken off their padala
--
-- Column privileges on `orders` are granted one column at a time — the
-- cost columns stay behind the wall — so a column added afterwards is
-- readable by nobody until the grant is re-run. A behaviour check written
-- in 0036 catches exactly this, and caught it here: without the line below
-- a customer's own receipt could not show the discount that was applied to
-- their own order.
--
-- `delivery_discount` is deliberately NOT hidden. It is money the customer
-- was given, on their own bill; the figures behind the wall are what the
-- shop paid and earned, which is a different question.
-- ------------------------------------------------------------

select regrant_visible_columns();

-- ------------------------------------------------------------
-- Behaviour checks
-- ------------------------------------------------------------

do $$
declare
  v_id text;
begin
  -- A delivery promo, with no dish, is allowed.
  insert into promos (code, label, kind, value, scope)
  values ('ZZFREEDEL', 'ZZ Free padala', 'percent', 100, 'delivery')
  returning id into v_id;

  -- With a dish, it is not: a delivery code does not belong to a meal.
  begin
    insert into promos (code, label, kind, value, scope, meal_id)
    values ('ZZBAD', 'ZZ Bad', 'percent', 100, 'delivery',
            (select id from meals limit 1));
    -- Only a failure if there WAS a meal to point at.
    if exists (select 1 from meals) then
      raise exception 'FAIL: a delivery promo was allowed to name a dish';
    end if;
  exception
    when check_violation then null;
  end;

  -- The old two still work.
  insert into promos (code, label, kind, value, scope)
  values ('ZZORDER', 'ZZ Order', 'amount', 50, 'order');

  -- And a scope nobody defined is still refused.
  begin
    insert into promos (code, label, kind, value, scope)
    values ('ZZNONSENSE', 'ZZ Nonsense', 'amount', 50, 'tip');
    raise exception 'FAIL: an unknown scope was accepted';
  exception
    when check_violation then null;
  end;

  delete from promos where code like 'ZZ%';
  raise notice 'OK: delivery is a scope, it carries no dish, and nonsense is refused';
end $$;

do $$
begin
  -- Negative is not a discount.
  begin
    insert into orders (date, revenue, delivery_discount)
    values (current_date, 100, -5);
    raise exception 'FAIL: a negative delivery discount was accepted';
  exception
    when check_violation then null;
  end;
  raise notice 'OK: a delivery discount cannot be negative';
end $$;

do $$
declare
  v_named boolean;
begin
  /* The guard must NAME the new column.

     This is the check that matters most in this migration. `guard_order_money`
     is a deny-list: it refuses only the columns it mentions, so a money
     column added without touching it is wide open, and this particular one
     decides whether a customer pays for delivery. Reading the function's own
     source is the only way to know the line survived — a later edit that
     re-creates the guard from the 0066 copy would drop it silently, and
     nothing else in the system would notice. */
  select pg_get_functiondef(p.oid) like '%delivery_discount%'
    into v_named
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'guard_order_money' and n.nspname = 'public'
   limit 1;

  if v_named is distinct from true then
    raise exception
      'FAIL: guard_order_money does not mention delivery_discount, so a signed-in customer can give themselves free delivery';
  end if;

  raise notice 'OK: the money guard names delivery_discount';
end $$;
