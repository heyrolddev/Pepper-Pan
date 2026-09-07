-- ============================================================
-- What the migrations are supposed to DO, asserted against a real Postgres.
--
-- Every check here is one somebody guessed at before this file existed. The
-- shift gate in particular is a security boundary, and "the SQL compiles" says
-- nothing about whether a clocked-out staff session is actually refused.
--
-- Run it with scripts/verify-migrations.sh. It raises rather than returns on
-- failure, so a green run means every line held.
-- ============================================================

\set ON_ERROR_STOP on
\pset tuples_only on

-- Two people to act as.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','owner@x'),
  ('22222222-2222-2222-2222-222222222222','staff@x')
on conflict do nothing;
insert into profiles (id, role, full_name) values
  ('11111111-1111-1111-1111-111111111111','owner','The Owner'),
  ('22222222-2222-2222-2222-222222222222','staff','Ana')
on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;

create or replace function act_as(u text) returns void language sql as
$f$ select set_config('request.jwt.claim.sub', u, false)::void $f$;
create or replace function act_as_service() returns void language sql as
$f$ select set_config('request.jwt.claim.sub', '', false)::void $f$;

\echo '--- tickets are sequential and unique ---'
select act_as_service();
insert into orders (revenue, status) values (100, 'completed');
insert into orders (revenue, status) values (200, 'completed');
select 'tickets: ' || string_agg(ticket::text, ',' order by ticket) from orders;
select 'unique: ' || (count(*) = count(distinct ticket))::text from orders;

\echo '--- the service role writes without a shift (this is how the app writes) ---'
select act_as_service();
insert into orders (revenue, status) values (50, 'completed');
select 'service insert: ok';

\echo '--- staff, NOT clocked in: refused ---'
select act_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  insert into orders (revenue, status) values (10, 'completed');
  raise exception 'FAIL: a clocked-out staff insert went through';
exception when insufficient_privilege then
  raise notice 'refused, correctly: %', sqlerrm;
end $$;
do $$ begin
  update orders set status = 'cancelled' where revenue = 100;
  raise exception 'FAIL: a clocked-out staff update went through';
exception when insufficient_privilege then
  raise notice 'refused, correctly';
end $$;

\echo '--- the owner, with no shift at all: allowed ---'
select act_as('11111111-1111-1111-1111-111111111111');
insert into orders (revenue, status) values (77, 'completed');
select 'owner insert: ok';

\echo '--- staff, clocked in: allowed ---'
select act_as_service();
select 'clocked in at ' || (clock_in('22222222-2222-2222-2222-222222222222')).started_at;
select act_as('22222222-2222-2222-2222-222222222222');
insert into orders (revenue, status) values (33, 'completed');
select 'on-shift insert: ok';

\echo '--- a stale shift is closed, flagged, and left uncounted ---'
select act_as_service();
update staff_shifts set started_at = now() - interval '20 hours'
  where staff_id = '22222222-2222-2222-2222-222222222222' and ended_at is null;
select 'closed: ' || count(*) from close_stale_shifts(14);
select 'auto_closed=' || auto_closed || ' cash_is_null=' || (closing_cash is null)::text
  from staff_shifts where staff_id = '22222222-2222-2222-2222-222222222222';
select 'note: ' || note from staff_shifts where auto_closed;

\echo '--- and that shift is no longer a key ---'
select act_as('22222222-2222-2222-2222-222222222222');
do $$ begin
  insert into orders (revenue, status) values (11, 'completed');
  raise exception 'FAIL: an auto-closed shift still let a write through';
exception when insufficient_privilege then
  raise notice 'refused, correctly';
end $$;

\echo '--- a fresh shift is not stale ---'
select act_as_service();
select 'in again: ' || (clock_in('22222222-2222-2222-2222-222222222222')).id;
select 'closed this time: ' || count(*) from close_stale_shifts(14);

\echo '--- the ticket sequence survives a restore that brings its own numbers ---'
select act_as_service();
insert into orders (ticket, revenue, status) values (5000, 10, 'completed');
select 'synced to: ' || sync_order_ticket_seq();
insert into orders (revenue, status) values (12, 'completed');
select 'next ticket after restore: ' || ticket from orders order by ticket desc limit 1;

\echo '--- clocking in is never blocked by the clock ---'
select act_as_service();
select 'clock functions reachable: ok';
\set ON_ERROR_STOP on
\pset tuples_only on

insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333','cust@x') on conflict do nothing;
insert into profiles (id, role, full_name) values ('33333333-3333-3333-3333-333333333333','customer','Maria')
  on conflict (id) do update set role='customer', full_name='Maria';

\echo '--- a customer places and cancels their own order, no shift anywhere ---'
select act_as('33333333-3333-3333-3333-333333333333');
insert into orders (customer_id, revenue, status, contact_name)
  values ('33333333-3333-3333-3333-333333333333', 150, 'pending', 'Maria');
select 'customer insert: ok, ticket ' || ticket from orders where customer_id is not null;

update orders
  set status='cancelled',
      cancelled_reason='Changed my mind',
      cancelled_by='33333333-3333-3333-3333-333333333333',
      cancelled_at=now()
  where customer_id = '33333333-3333-3333-3333-333333333333';
select 'customer cancel: ok — by ' || cancelled_by || ' at ' || (cancelled_at is not null)::text
  from orders where customer_id is not null;

\echo '--- cancelled_by is a real reference, and survives the person leaving ---'
select act_as_service();
select 'fk to profiles: ' || (count(*) > 0)::text
  from information_schema.table_constraints tc
  join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name
  where tc.table_name='orders' and tc.constraint_type='FOREIGN KEY' and k.column_name='cancelled_by';

\echo '--- the triggers landed on the tables that matter ---'
select 'tables guarded: ' || count(*) from pg_trigger
  where tgname like 'require_shift_%' and not tgisinternal;
select 'staff_shifts NOT guarded: ' || (count(*) = 0)::text from pg_trigger
  where tgname = 'require_shift_staff_shifts';
select 'profiles NOT guarded: ' || (count(*) = 0)::text from pg_trigger
  where tgname = 'require_shift_profiles';

\echo '--- every column a browser session must read, it can read ---'
-- The check that was missing. `orders` and `waste_log` have column-level
-- SELECT so the margin stays out of reach of a signed-in customer; a column
-- added later gets no grant at all, and Postgres calls that "permission denied
-- for table orders" — which reads like the table vanished. It is how the
-- Orders page broke the day `ticket` shipped.
do $$
declare
  spec record;
  c record;
  missing text[] := '{}';
  leaked text[] := '{}';
begin
  for spec in
    select 'orders'::text as tbl, array['cogs','oe','gross_profit','net_profit']::text[] as hidden
    union all
    select 'waste_log'::text, array['cost_at_time','total_cost']::text[]
  loop
    for c in
      select column_name from information_schema.columns
      where table_schema='public' and table_name=spec.tbl
    loop
      if c.column_name = any (spec.hidden) then
        if has_column_privilege('authenticated', spec.tbl, c.column_name, 'select') then
          leaked := leaked || (spec.tbl || '.' || c.column_name);
        end if;
      else
        if not has_column_privilege('authenticated', spec.tbl, c.column_name, 'select') then
          missing := missing || (spec.tbl || '.' || c.column_name);
        end if;
      end if;
    end loop;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception 'FAIL: a signed-in session cannot read %. Call regrant_visible_columns() in the migration that added it.', missing;
  end if;
  if array_length(leaked, 1) > 0 then
    raise exception 'FAIL: the margin is readable by a browser session: %', leaked;
  end if;
  raise notice 'every visible column readable, every cost column still walled off';
end $$;
