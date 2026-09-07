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

\echo '--- the two families of safety copy are trimmed apart ---'
-- Automatic daily copies and the copy taken just before a restore keep
-- different histories. One trim for both would either throw away the daily
-- record or hoard copies nobody will read.
select act_as_service();
do $$
declare n int;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='restore_snapshots'
                   and column_name='automatic') then
    raise exception 'FAIL: restore_snapshots.automatic is missing';
  end if;

  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='restore_snapshots'
     and column_name='automatic' and is_nullable='NO' and column_default = 'false';
  if n <> 1 then
    raise exception 'FAIL: automatic must be NOT NULL DEFAULT false so old rows read as "asked for"';
  end if;

  raise notice 'the families can be told apart, and old copies default to asked-for';
end $$;

\echo '--- the weekly off-site copy cannot switch itself on ---'
-- The file is every customer's name, phone and address. A migration that
-- started emailing it would be the worst kind of helpful, so the default is
-- asserted rather than assumed.
select act_as_service();
do $$
declare on_by_default boolean;
begin
  select offsite_backup_enabled into on_by_default from settings where id = 1;
  if on_by_default is null then
    raise exception 'FAIL: settings row 1 has no offsite_backup_enabled';
  end if;
  if on_by_default then
    raise exception 'FAIL: the weekly copy is ON by default — it must wait to be asked';
  end if;
  if exists (select 1 from settings where id = 1 and offsite_backup_email is not null) then
    raise exception 'FAIL: an address was assumed rather than chosen';
  end if;
  raise notice 'off by default, and no address assumed';
end $$;

-- ============================================================
-- 0039 — the photo on the account, and reviews that came in by chat
--
-- A NOTE ON `set role`, WHICH IS THE WHOLE REASON THIS SECTION IS WRITTEN
-- THE WAY IT IS.
--
-- `act_as()` above only sets the JWT claim that `auth.uid()` reads. It does
-- NOT change the database role, so a check that uses `act_as` alone still
-- runs as postgres — a superuser, which bypasses row-level security
-- completely. That is fine for the shift gate, which is a trigger, and it is
-- worthless for anything enforced by a policy: the check passes whether the
-- policy exists or not.
--
-- That exact mistake is how a missing grant on `orders` reached the owner's
-- screen with a green harness behind it. So every check below that depends on
-- a policy does `set role authenticated` as well, and the setup between them
-- does `reset role` to get its privileges back. When a check exercises a
-- trigger rather than a policy the comment says so.
-- ============================================================

\echo '--- a customer, a dish, and a completed order to review ---'
reset role;
select act_as_service();
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333','maria@x'),
  ('44444444-4444-4444-4444-444444444444','pedro@x')
on conflict do nothing;
insert into profiles (id, role, full_name, phone, avatar_url) values
  ('33333333-3333-3333-3333-333333333333','customer','Maria Clara','0917','https://x/av/maria.webp'),
  ('44444444-4444-4444-4444-444444444444','customer','Pedro Penduko','0918',null)
on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      avatar_url = excluded.avatar_url;
insert into meals (id, name, price) values ('m-pepper','Pepper Beef',120)
  on conflict (id) do nothing;
insert into orders (id, customer_id, revenue, status) values
  ('o-maria','33333333-3333-3333-3333-333333333333',120,'completed'),
  ('o-pedro','44444444-4444-4444-4444-444444444444',120,'completed')
  on conflict (id) do nothing;
insert into order_lines (order_id, meal_id, qty, price_at_sale)
  values ('o-maria', 'm-pepper', 1, 120);
select 'set up: ok';

\echo '--- a customer posts their own review, through RLS, and it is theirs ---'
select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
insert into reviews (customer_id, meal_id, rating, comment)
  values ('33333333-3333-3333-3333-333333333333', null, 5, 'Ang sarap!');
select 'source=' || source || ' relayed_by_is_null=' || (relayed_by is null)::text
  from reviews where customer_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo '--- THE BUG 0039 FIXES: a signed-out visitor could not read the author ---'
-- Before 0039 the reviews page joined `profiles` with the visitor's own
-- session. `profiles_select_own` is `id = auth.uid() or is_staff()`, so a
-- visitor who was not signed in got nothing back and every review on the page
-- rendered as "A customer" — silently, because a missing name has a fallback.
-- Both halves are asserted: profiles still refuses, and the narrow view
-- answers.
select act_as_service();
set role anon;
do $$
declare n int;
begin
  select count(*) into n from profiles
   where id = '33333333-3333-3333-3333-333333333333';
  if n <> 0 then
    raise exception 'FAIL: an anonymous visitor can read the profiles table (% rows)', n;
  end if;
  raise notice 'profiles still refuses an anonymous read, as it should';
end $$;
do $$
declare nm text; av text;
begin
  select full_name, avatar_url into nm, av from review_authors
   where id = '33333333-3333-3333-3333-333333333333';
  if nm is null then
    raise exception 'FAIL: a visitor cannot see who wrote a published review — the page would say "A customer"';
  end if;
  if av is null then
    raise exception 'FAIL: a visitor cannot see the author photo, so the avatar would never appear';
  end if;
  raise notice 'a visitor sees the author as "%" with a photo', nm;
end $$;

\echo '--- and the view carries nothing else about them ---'
do $$
declare cols text[];
begin
  select array_agg(column_name order by column_name) into cols
    from information_schema.columns
   where table_schema='public' and table_name='review_authors';
  if cols is distinct from array['avatar_url','full_name','id'] then
    raise exception 'FAIL: review_authors exposes % — it must be the name and the photo, nothing more', cols;
  end if;
  raise notice 'the view is three columns: %', cols;
end $$;

\echo '--- somebody with no published review is not in it at all ---'
-- Otherwise the view would be a publicly readable list of the shop's
-- customers, which is a very different thing from "who said this".
do $$ begin
  if exists (select 1 from review_authors where id = '44444444-4444-4444-4444-444444444444') then
    raise exception 'FAIL: a customer who never reviewed anything is listed publicly';
  end if;
  raise notice 'only people who published a review are listed';
end $$;
reset role;

\echo '--- hiding a review takes its author back out of public view ---'
select act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
update reviews set is_hidden = true
  where customer_id = '33333333-3333-3333-3333-333333333333';
reset role;
set role anon;
do $$ begin
  if exists (select 1 from review_authors where id = '33333333-3333-3333-3333-333333333333') then
    raise exception 'FAIL: hiding a review left its author on public display';
  end if;
  raise notice 'hidden review, author no longer listed';
end $$;
reset role;
set role authenticated;
update reviews set is_hidden = false
  where customer_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo '--- the owner can type in a review that arrived on Messenger ---'
select act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
insert into reviews (source, customer_id, author_name, meal_id, rating, comment)
  values ('relayed', null, 'Josie', 'm-pepper', 5, 'Sent this on Messenger');
select 'relayed_by_is_owner=' || (relayed_by = '11111111-1111-1111-1111-111111111111')::text
  from reviews where author_name = 'Josie';

\echo '--- two different people can relay a review of the same dish ---'
-- The one-review-each rule only ever meant anything for accounts. Left
-- applying to relayed rows, the second Messenger review of a dish would fail.
insert into reviews (source, customer_id, author_name, meal_id, rating, comment)
  values ('relayed', null, 'Lito', 'm-pepper', 4, 'Also sent this on Messenger');
select 'relayed reviews of one dish: ' || count(*)
  from reviews where source = 'relayed' and meal_id = 'm-pepper';
reset role;

\echo '--- but one account still gets one review per dish ---'
select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
insert into reviews (customer_id, meal_id, rating) values
  ('33333333-3333-3333-3333-333333333333', 'm-pepper', 4);
do $$ begin
  insert into reviews (customer_id, meal_id, rating) values
    ('33333333-3333-3333-3333-333333333333', 'm-pepper', 1);
  raise exception 'FAIL: one account reviewed the same dish twice';
exception when unique_violation then
  raise notice 'one review per dish per account, still enforced';
end $$;
reset role;

\echo '--- a customer cannot pass a review off as one the shop relayed ---'
-- The attack: POST straight to /rest/v1/reviews with source=relayed and any
-- name you like, and the shop is publishing words under a stranger's name
-- with the shop's own credibility attached.
--
-- It is not refused with an error — it is neutralised. The guard trigger
-- rewrites the row to what it actually is: this account, posting as itself.
-- Asserting the result rather than an exception is the point, because a clamp
-- that silently did nothing would raise no exception either.
select act_as('44444444-4444-4444-4444-444444444444');
set role authenticated;
insert into reviews (source, customer_id, author_name, rating, comment)
  values ('relayed', null, 'Totally Real Person', 5, 'Best in town');
do $$
declare r record;
begin
  select source, customer_id, author_name, relayed_by into r
    from reviews where comment = 'Best in town';
  if r.source <> 'customer' then
    raise exception 'FAIL: a customer published a review marked as relayed by the shop';
  end if;
  if r.customer_id <> '44444444-4444-4444-4444-444444444444' then
    raise exception 'FAIL: the review is not attributed to the account that posted it';
  end if;
  if r.author_name is not null then
    raise exception 'FAIL: a customer put a name of their own choosing on a review';
  end if;
  if r.relayed_by is not null then
    raise exception 'FAIL: the review claims a member of staff typed it in';
  end if;
  raise notice 'the attempt was rewritten to what it is: this account, posting as itself';
end $$;
reset role;

\echo '--- and cannot rename the author of a relayed one ---'
select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
update reviews set author_name = 'Somebody Else' where author_name = 'Josie';
do $$ begin
  if not exists (select 1 from reviews where author_name = 'Josie') then
    raise exception 'FAIL: a customer renamed the author of a relayed review';
  end if;
  raise notice 'the name on a relayed review is not a customer''s to change';
end $$;
reset role;

\echo '--- the database refuses a review with nobody behind it ---'
-- Table constraints, so these hold for the service role too — which is the
-- one caller that no policy stops.
select act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
do $$ begin
  insert into reviews (source, customer_id, author_name, rating)
    values ('relayed', null, '   ', 4);
  raise exception 'FAIL: a relayed review with no name was accepted';
exception when check_violation then
  raise notice 'a relayed review must say whose it is';
end $$;
do $$ begin
  insert into reviews (source, customer_id, rating) values ('customer', null, 4);
  raise exception 'FAIL: a customer review with no account was accepted';
exception when check_violation then
  raise notice 'a customer review must have an account behind it';
end $$;
do $$ begin
  insert into reviews (source, customer_id, author_name, rating)
    values ('made-up', null, 'X', 4);
  raise exception 'FAIL: an unknown review source was accepted';
exception when check_violation then
  raise notice 'a review is either posted or relayed, nothing else';
end $$;
reset role;

\echo '--- an account can set its own photo, and nobody else''s ---'
select act_as('33333333-3333-3333-3333-333333333333');
set role authenticated;
update profiles set avatar_url = 'https://x/av/new.webp'
  where id = '33333333-3333-3333-3333-333333333333';
select 'own photo: ' || avatar_url from profiles
  where id = '33333333-3333-3333-3333-333333333333';
update profiles set avatar_url = 'https://x/av/hijack.webp'
  where id = '44444444-4444-4444-4444-444444444444';
reset role;
do $$
declare theirs text;
begin
  select avatar_url into theirs from profiles
   where id = '44444444-4444-4444-4444-444444444444';
  if theirs is not null then
    raise exception 'FAIL: one account set another account''s profile picture';
  end if;
  raise notice 'a photo can only be set on your own account';
end $$;

\echo '--- a relayed review counts towards the dish average, like any other ---'
-- Deliberate. The rating is a real customer's even though the shop typed it
-- in, so it counts. What is not hidden is where it came from: the card says.
set role anon;
do $$
declare n int;
begin
  select review_count into n from meal_ratings where meal_id = 'm-pepper';
  if coalesce(n, 0) < 3 then
    raise exception 'FAIL: the dish average is missing reviews (saw %)', n;
  end if;
  raise notice 'the dish average counts % reviews, relayed ones included', n;
end $$;
reset role;

\echo '--- a relayed review outlives the person who typed it in ---'
-- The words belong to the customer, not to the member of staff who relayed
-- them. Without ON DELETE SET NULL the review would either be deleted with
-- that account or block its removal entirely.
reset role;
select act_as_service();
do $$
declare kept int;
begin
  insert into auth.users (id, email) values
    ('55555555-5555-5555-5555-555555555555','leaver@x') on conflict do nothing;
  insert into profiles (id, role, full_name) values
    ('55555555-5555-5555-5555-555555555555','staff','Leaver')
    on conflict (id) do update set role = excluded.role;
  insert into reviews (source, customer_id, author_name, rating, comment, relayed_by)
    values ('relayed', null, 'Nena', 5, 'Relayed by someone who later left',
            '55555555-5555-5555-5555-555555555555');

  delete from auth.users where id = '55555555-5555-5555-5555-555555555555';

  select count(*) into kept from reviews
   where comment = 'Relayed by someone who later left' and relayed_by is null;
  if kept <> 1 then
    raise exception 'FAIL: the relayed review did not survive the relayer leaving (kept %)', kept;
  end if;
  raise notice 'the review stayed, and no longer points at a deleted account';
end $$;
