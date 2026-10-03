/*
 * Twenty-five columns the guard did not name.
 *
 * `guard_order_money` is a DENY-LIST: it refuses only the columns it
 * mentions, one `is distinct from` at a time. That shape is deliberate and
 * it is good — the refusal can say WHICH column was being rewritten, and
 * "permission denied" over a legitimate edit is a support message somebody
 * has to answer by hand. The cost of it is that every column it does not
 * name is wide open, and nothing anywhere announces that.
 *
 * `orders` has thirty-eight columns. The guard named thirteen.
 *
 * So the other twenty-five were tested rather than reasoned about: a real
 * signed-in customer, on their own pending order, against a real Postgres,
 * one UPDATE per column. Twenty-five allowed, nothing refused.
 *
 * Most of those are harmless and stay open on purpose — see the bottom of
 * this file, where that is pinned too. These are the ones that cost
 * something, every one of them proven rather than suspected:
 *
 *   stock_applied_at  The worst, and it was run end to end. The customer
 *                     stamps the claim on their own pending order; the
 *                     kitchen confirms; `apply_order_stock` finds the claim
 *                     already made and skips the whole deduction. Observed:
 *                     shelf 10kg before, 10kg after, the dish sold, cogs
 *                     0.00 and the ticket reading 100% margin. Nothing in
 *                     the system says a word, which is what makes it the
 *                     expensive one — the shelf simply drifts and the
 *                     margins look wonderful.
 *
 *   fulfillment       Order as pickup, so `delivery_fee` is written ₱0, then
 *                     flip to delivery while still pending. The fee is
 *                     guarded at the ₱0 it was born with and nothing
 *                     recomputes it after checkout. Free padala, every time.
 *
 *   is_backfill       One flag and the order leaves the 90-day cost
 *                     baseline, and anything else that filters on it.
 *
 *   shift_id,         Whose shift took the money, and who rang it up. A
 *   logged_by, tag    forged answer is worse than none: it sends the owner
 *                     to ask the wrong person about a short drawer.
 *
 *   eta_*,            The shop's promise about when food will be ready, the
 *   notified_status   record of having chased it, and the flag that decides
 *                     whether the customer is messaged at all.
 *
 *   paid_at,          When the money arrived and on what terms.
 *   payment_plan      `payment_status` and `downpayment_amount` were already
 *                     named; these two are the rest of the same sentence.
 *
 *   created_at        Every day's takings is a range over this.
 *
 * ── Why the whole row is still not compared ──────────────────────────────
 *
 * Because the named-column shape is what makes the refusal useful, and
 * because a whole-row compare would refuse `updated_at` — which a BEFORE
 * UPDATE trigger sets on every single write, including the customer's own
 * legitimate ones. A guard that refuses every edit is not a stricter guard,
 * it is a broken screen.
 *
 * What a deny-list really needs is a test that fails when somebody adds a
 * money column and forgets this file. The second behaviour check below is
 * that test: it walks the live column list and asserts every column is
 * either named by the guard or on an explicit list of ones a customer may
 * write. A new column is neither, so it fails on the day it is added.
 */

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
  -- ----------------------------------------------------------
  -- New in 0077. Everything below was tested as a real signed-in
  -- customer against a real Postgres and every one of them went
  -- through. These are the ones that cost something.
  -- ----------------------------------------------------------
  -- Proven: a customer stamps this on their own pending order, the kitchen
  -- confirms, `apply_order_stock` sees the claim already made and skips —
  -- the dish is sold, not a gram leaves the shelf, cogs reads 0.00 and the
  -- ticket shows 100% margin. Silent, repeatable, and no screen says a word.
  if new.stock_applied_at is distinct from old.stock_applied_at then changed := array_append(changed, 'stock_applied_at'); end if;
  -- Order as pickup (fee ₱0), flip to delivery while pending. The fee is
  -- guarded at the ₱0 it was written with and nothing recomputes it after
  -- checkout, so the shop delivers for free.
  if new.fulfillment   is distinct from old.fulfillment   then changed := array_append(changed, 'fulfillment'); end if;
  -- Marks the row as a day-backfill, which drops it out of the 90-day cost
  -- baseline and anything else filtering `is_backfill = false`.
  if new.is_backfill   is distinct from old.is_backfill   then changed := array_append(changed, 'is_backfill'); end if;
  -- Attribution. These three say who took the money and on whose shift; a
  -- customer rewriting them sends the owner to ask the wrong person.
  if new.shift_id      is distinct from old.shift_id      then changed := array_append(changed, 'shift_id'); end if;
  if new.logged_by     is distinct from old.logged_by     then changed := array_append(changed, 'logged_by'); end if;
  if new.tag           is distinct from old.tag           then changed := array_append(changed, 'tag'); end if;
  -- The shop's own promise about when food will be ready, and the record of
  -- having chased it. Neither is the customer's to set, and `notified_status`
  -- lets them mute the message the shop is about to send them.
  if new.eta_minutes   is distinct from old.eta_minutes   then changed := array_append(changed, 'eta_minutes'); end if;
  if new.eta_set_at    is distinct from old.eta_set_at    then changed := array_append(changed, 'eta_set_at'); end if;
  if new.eta_alerted_at is distinct from old.eta_alerted_at then changed := array_append(changed, 'eta_alerted_at'); end if;
  if new.notified_status is distinct from old.notified_status then changed := array_append(changed, 'notified_status'); end if;
  -- When the money arrived, and on what terms. `payment_status` and
  -- `downpayment_amount` were already named; these two are the rest of the
  -- same sentence, and a bill dated to another day is a bill nobody chases.
  if new.paid_at       is distinct from old.paid_at       then changed := array_append(changed, 'paid_at'); end if;
  if new.payment_plan  is distinct from old.payment_plan  then changed := array_append(changed, 'payment_plan'); end if;
  -- When the order was placed. Nothing legitimately changes it, and every
  -- day's takings is a range over it.
  if new.created_at    is distinct from old.created_at    then changed := array_append(changed, 'created_at'); end if;

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
-- ---------------------------------------------------------------
-- Behaviour checks
-- ---------------------------------------------------------------

/*
 * Columns a customer MAY write on their own pending order.
 *
 * This is the other half of the line, and it is written down so that a
 * later tightening cannot quietly take the customer's own details away
 * from them. Every one of these is theirs: where the food goes, how to
 * reach them, what they asked for, when they want it, and calling it off.
 *
 * `updated_at` is here because a trigger writes it on every update,
 * including theirs. `status` is here because cancelling their own pending
 * order is a thing the policy in 0004 exists to allow.
 */
create or replace function customer_writable_order_columns()
returns text[]
language sql immutable
set search_path = public
as $$ select array[
  'status',
  'contact_name', 'contact_phone', 'notes',
  'delivery_address', 'delivery_lat', 'delivery_lng', 'delivery_distance_km',
  'scheduled_for',
  'cancelled_at', 'cancelled_reason', 'cancelled_by',
  'updated_at',
  'id'
]::text[] $$;

do $$
declare
  v_def text;
  v_col text;
  v_missing text[] := '{}';
begin
  /* Every column is on one side of the line or the other.
   *
   * The check that makes a deny-list survivable. Add a money column to
   * `orders` tomorrow and it is neither named by the guard nor listed as
   * the customer's — so this fails the moment the migration runs, instead
   * of the column sitting open for seventy-five migrations the way
   * `stock_applied_at` did.
   */
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'guard_order_money' and n.nspname = 'public' limit 1;

  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'orders'
  loop
    if not (v_col = any (customer_writable_order_columns()))
       and position('old.' || v_col in v_def) = 0 then
      v_missing := array_append(v_missing, v_col);
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception
      'FAIL: guard_order_money does not name %, and they are not listed as the customer''s own to write. A deny-list protects nothing it does not name — add each one to the guard, or to customer_writable_order_columns() if a customer really may change it.',
      array_to_string(v_missing, ', ');
  end if;

  raise notice 'OK: every column on orders is either guarded or deliberately the customer''s';
end $$;

do $$
declare
  v_id text;
  v_col text;
  v_shift text;
  v_allowed text[] := '{}';
  v_pairs text[][] := array[
    ['stock_applied_at', 'now()'],
    ['fulfillment',      '''delivery'''],
    ['is_backfill',      'true'],
    ['shift_id',         'current_setting(''zz.shift'')'],
    ['logged_by',        '''Somebody Else'''],
    ['tag',              '''walk-in'''],
    ['eta_minutes',      '1'],
    ['eta_set_at',       'now()'],
    ['eta_alerted_at',   'now()'],
    ['notified_status',  '''ready'''],
    ['paid_at',          'now()'],
    ['payment_plan',     '''downpayment'''],
    ['created_at',       '''2020-01-01''']
  ];
  i int;
begin
  /* The exploits themselves, run as a real customer.
   *
   * The check above proves the guard MENTIONS each column. This proves the
   * refusal actually fires — which is the thing that matters, and the thing
   * that was false for every one of these until this migration.
   */
  insert into auth.users (id, email)
  values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'zz-guard-probe@x')
  on conflict do nothing;

  /* A real shift to point at. Setting `shift_id` to null would have been
     no change at all on an order that has none — `is distinct from` is
     false — and the probe would have passed while proving nothing. It did
     exactly that on the first run, which is the whole argument for writing
     the exploit out rather than trusting the guard's source. */
  insert into staff_shifts (staff_id)
  values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') returning id into v_shift;
  perform set_config('zz.shift', v_shift, true);

  insert into orders (date, revenue, status, customer_id, fulfillment, delivery_fee)
  values (current_date, 500, 'pending', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'pickup', 0)
  returning id into v_id;

  for i in 1 .. array_length(v_pairs, 1) loop
    v_col := v_pairs[i][1];
    perform set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      execute format('update orders set %I = %s where id = %L', v_col, v_pairs[i][2], v_id);
      v_allowed := array_append(v_allowed, v_col);
    exception
      when insufficient_privilege then null;
    end;
    perform set_config('request.jwt.claim.sub', '', true);
  end loop;

  if array_length(v_allowed, 1) > 0 then
    raise exception
      'FAIL: a signed-in customer rewrote % on their own order',
      array_to_string(v_allowed, ', ');
  end if;

  delete from orders where id = v_id;
  raise notice 'OK: all 13 exploits are refused for a real signed-in customer';
end $$;

do $$
declare
  v_id text;
  v_refused text[] := '{}';
begin
  /* And the customer can still edit their own order.
   *
   * The failure this guards against is the opposite one: a later tightening
   * that locks somebody out of changing the address their own dinner is
   * going to. Those refusals do not look like a security feature from the
   * customer's side, they look like the site being broken.
   */
  insert into orders (date, revenue, status, customer_id, fulfillment)
  values (current_date, 500, 'pending', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'delivery')
  returning id into v_id;

  perform set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin update orders set delivery_address = '12 New Street' where id = v_id;
  exception when insufficient_privilege then v_refused := array_append(v_refused, 'delivery_address'); end;

  begin update orders set contact_phone = '09170000000' where id = v_id;
  exception when insufficient_privilege then v_refused := array_append(v_refused, 'contact_phone'); end;

  begin update orders set notes = 'no chilli please' where id = v_id;
  exception when insufficient_privilege then v_refused := array_append(v_refused, 'notes'); end;

  begin
    update orders set status = 'cancelled', cancelled_reason = 'changed my mind',
                      cancelled_at = now() where id = v_id;
  exception when insufficient_privilege then v_refused := array_append(v_refused, 'cancelling'); end;

  perform set_config('request.jwt.claim.sub', '', true);

  if array_length(v_refused, 1) > 0 then
    raise exception
      'FAIL: the guard now refuses a customer their own %, which is the site being broken rather than secured',
      array_to_string(v_refused, ', ');
  end if;

  delete from orders where id = v_id;
  raise notice 'OK: a customer can still change their address, their number, their notes, and call it off';
end $$;
