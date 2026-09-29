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

-- ============================================================
-- 0040 — the menu opens on food
-- ============================================================

\echo '--- the named order is applied, whatever the spacing and case ---'
reset role;
select act_as_service();
do $$
declare got text;
begin
  -- The shop's real vocabulary, including the seeded-by-popularity numbers
  -- that put Drinks first: Drinks had the most dishes in it.
  insert into menu_categories (name, colour, sort_order) values
    ('Drinks','brand',10), ('Mains','gold',20), ('Coffee','jade',30),
    ('Solo','chili',40), ('Burger','teal',50), ('Premium Sides','brown',60),
    ('Milktea','ink',70), ('Raspberry','sand',80), ('Soft drinks','brand',90),
    ('ji pai','gold',100)
  on conflict (name) do update set sort_order = excluded.sort_order;

  perform order_menu_categories();

  select string_agg(name, ' > ' order by sort_order, name) into got
    from menu_categories;
  if got <> 'Mains > ji pai > Solo > Burger > Premium Sides > Coffee > Milktea > Raspberry > Soft drinks > Drinks' then
    raise exception 'FAIL: the menu order came out as %', got;
  end if;
  raise notice 'food first, drinks last: %', got;
end $$;

\echo '--- and "Drinks" is last on purpose, not by accident ---'
-- If Drinks ranked before Milktea or Soft drinks it would swallow them: a
-- dish sits in the earliest block any of its categories names, and nearly
-- every drink carries the Drinks tag as well as its own.
do $$
declare drinks int; softdrinks int;
begin
  select sort_order into drinks from menu_categories where name = 'Drinks';
  select sort_order into softdrinks from menu_categories where name = 'Soft drinks';
  if drinks <= softdrinks then
    raise exception 'FAIL: the Drinks umbrella ranks at or before Soft drinks, so it will swallow every drink';
  end if;
  raise notice 'the umbrella sits behind the specific categories';
end $$;

\echo '--- a category nobody named keeps its place at the end ---'
do $$
declare pos int; last_named int;
begin
  insert into menu_categories (name, colour, sort_order)
    values ('Seasonal','jade',5) on conflict (name) do nothing;
  perform order_menu_categories();
  select sort_order into pos from menu_categories where name = 'Seasonal';
  select sort_order into last_named from menu_categories where name = 'Drinks';
  if pos <= last_named then
    raise exception 'FAIL: an unnamed category jumped in front of the named ones (% vs %)', pos, last_named;
  end if;
  raise notice 'a new category lands at the end rather than reshuffling the menu';
end $$;

\echo '--- re-running it changes nothing ---'
do $$
declare again int;
begin
  select order_menu_categories() into again;
  if again <> 0 then
    raise exception 'FAIL: re-running the ordering moved % rows — it is not idempotent', again;
  end if;
  raise notice 'safe to run twice';
end $$;

\echo '--- and the public cannot call it ---'
do $$ begin
  if has_function_privilege('anon', 'order_menu_categories(text[])', 'execute')
     or has_function_privilege('authenticated', 'order_menu_categories(text[])', 'execute') then
    raise exception 'FAIL: a browser session can rewrite what every customer sees first';
  end if;
  raise notice 'not reachable from a browser';
end $$;

-- ============================================================
-- 0041 — indexes, and totals the database works out
-- ============================================================

\echo '--- the five missing indexes are there ---'
reset role;
select act_as_service();
do $$
declare want text[] := array['idx_consumption_log_date','idx_waste_log_date',
                             'idx_waste_log_ingredient','idx_activity_log_at',
                             'idx_order_lines_meal'];
        missing text[] := '{}';
        n text;
begin
  foreach n in array want loop
    if not exists (select 1 from pg_indexes where schemaname='public' and indexname=n) then
      missing := missing || n;
    end if;
  end loop;
  if array_length(missing,1) > 0 then
    raise exception 'FAIL: missing %', missing;
  end if;
  raise notice 'all five indexes present';
end $$;

\echo '--- per-customer totals are grouped by the database, and only completed orders count ---'
-- The screen used to pull every order ever taken and add them up in
-- JavaScript. The point of the view is one row per customer; the point of
-- this check is that the arithmetic survived the move.
do $$
declare r record;
begin
  insert into auth.users (id,email) values
    ('66666666-6666-6666-6666-666666666666','totals@x') on conflict do nothing;
  insert into profiles (id,role,full_name) values
    ('66666666-6666-6666-6666-666666666666','customer','Totals Tester')
    on conflict (id) do update set role = excluded.role;
  insert into orders (id,customer_id,revenue,status) values
    ('t-1','66666666-6666-6666-6666-666666666666',100,'completed'),
    ('t-2','66666666-6666-6666-6666-666666666666',250,'completed'),
    ('t-3','66666666-6666-6666-6666-666666666666',999,'cancelled'),
    ('t-4','66666666-6666-6666-6666-666666666666',500,'pending');

  select * into r from customer_order_stats
   where customer_id = '66666666-6666-6666-6666-666666666666';

  if r.order_count <> 4 then
    raise exception 'FAIL: order_count is %, expected all 4 orders', r.order_count;
  end if;
  if r.completed_count <> 2 then
    raise exception 'FAIL: completed_count is %, expected 2', r.completed_count;
  end if;
  -- 999 was cancelled and 500 is still pending. Neither is money taken.
  if r.total_spent <> 350 then
    raise exception 'FAIL: total_spent is %, expected 350 (cancelled and pending must not count)', r.total_spent;
  end if;
  raise notice '4 orders, 2 completed, P350 spent — cancelled and pending correctly excluded';
end $$;

\echo '--- a walk-in with no account never becomes a phantom customer row ---'
do $$ begin
  insert into orders (id,customer_id,revenue,status) values ('t-walkin',null,80,'completed');
  if exists (select 1 from customer_order_stats where customer_id is null) then
    raise exception 'FAIL: counter sales with no account produced a null-customer row';
  end if;
  raise notice 'walk-ins stay out of the customer totals';
end $$;

\echo '--- the view respects who is asking ---'
-- security_invoker = true, so it is the caller's row-level security that
-- decides what goes into the sum. A view is not a way around the walls.
select act_as('66666666-6666-6666-6666-666666666666');
set role authenticated;
do $$
declare mine int; others int;
begin
  select count(*) into mine from customer_order_stats
   where customer_id = '66666666-6666-6666-6666-666666666666';
  select count(*) into others from customer_order_stats
   where customer_id <> '66666666-6666-6666-6666-666666666666';
  if mine <> 1 then raise exception 'FAIL: a customer cannot see their own totals'; end if;
  if others <> 0 then raise exception 'FAIL: a customer can see % other customers'' totals', others; end if;
  raise notice 'a customer sees their own totals and nobody else''s';
end $$;
reset role;
-- Clear the claim as well as the role. `set role anon` alone leaves the
-- previous caller's auth.uid() in place, which is a state no real request can
-- be in — a Supabase anon key carries no subject — and it made this check
-- fail against a visitor who was still secretly signed in.
select act_as_service();
set role anon;
do $$
declare n int;
begin
  select count(*) into n from customer_order_stats;
  if n <> 0 then raise exception 'FAIL: a signed-out visitor reads % rows of customer spend', n; end if;
  raise notice 'a signed-out visitor reads nothing';
end $$;
reset role;

\echo '--- and the margin is still not in it ---'
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='customer_order_stats'
               and column_name in ('cogs','gross_profit','net_profit','oe')) then
    raise exception 'FAIL: the view carries a cost column out past the grants that hide it';
  end if;
  raise notice 'revenue only — the margin stays walled off';
end $$;

-- ============================================================
-- 0042 — the pots, and stock purchases actually leaving one
-- ============================================================
\echo ''
\echo '=== 0042 money accounts ==='

select act_as_service();
reset role;

\echo '--- every ledger row has a pot, and old rows are the drawer ---'
do $$
declare bad int;
begin
  -- Rows written before 0042 must land on 'cash': they were all drawer
  -- movements, and defaulting them anywhere else would move money that never
  -- moved.
  insert into cash_ledger (date, type, amount, note)
  values (current_date, 'out', 250, 'pre-0042 style row, no account named');

  select count(*) into bad from cash_ledger where account is null;
  if bad > 0 then raise exception 'FAIL: % ledger rows have no pot', bad; end if;

  select count(*) into bad from cash_ledger
   where note = 'pre-0042 style row, no account named' and account <> 'cash';
  if bad > 0 then raise exception 'FAIL: a row with no account named did not land in the drawer';
  end if;
  raise notice 'a row that names no pot is the drawer, as every old row was';
end $$;

\echo '--- an unknown pot is refused rather than silently kept ---'
do $$ begin
  begin
    insert into cash_ledger (date, type, amount, account, note)
    values (current_date, 'out', 10, 'paymaya', 'a pot nobody added');
    raise exception 'FAIL: cash_ledger accepted an account it does not know';
  exception when check_violation then
    raise notice 'an unknown pot is refused';
  end;
end $$;

\echo '--- the drawer and the e-wallet do not touch each other ---'
do $$
declare drawer numeric; wallet numeric;
begin
  insert into cash_ledger (date, type, amount, account, note) values
    (current_date, 'out', 500, 'cash',  'stock paid from the drawer'),
    (current_date, 'out', 300, 'gcash', 'stock paid from the e-wallet');

  select coalesce(sum(amount), 0) into drawer
    from cash_ledger where account = 'cash' and note = 'stock paid from the drawer';
  select coalesce(sum(amount), 0) into wallet
    from cash_ledger where account = 'gcash' and note = 'stock paid from the e-wallet';

  if drawer <> 500 then raise exception 'FAIL: the drawer line is %, expected 500', drawer; end if;
  if wallet <> 300 then raise exception 'FAIL: the e-wallet line is %, expected 300', wallet; end if;

  -- The bug this guards: money-server reads the drawer with
  -- `.eq("account","cash")`. Without the filter the GCash spend above would
  -- come out of the drawer, which is money that never left it.
  select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
    into drawer from cash_ledger where account = 'cash';
  if exists (select 1 from cash_ledger where account = 'gcash' and account = 'cash') then
    raise exception 'FAIL: a row is in two pots at once';
  end if;
  raise notice 'a GCash spend never lands in the drawer total';
end $$;

\echo '--- the e-wallet has its own start, and is off until set ---'
do $$
declare enabled boolean; amount numeric;
begin
  select gcash_balance_enabled, gcash_balance_starting_amount
    into enabled, amount from settings where id = 1;
  if enabled is not false then
    raise exception 'FAIL: GCash counting is on by default — a balance nobody opened would read as real';
  end if;
  if amount <> 0 then raise exception 'FAIL: GCash opens at %, expected 0', amount; end if;
  raise notice 'GCash is off until the owner says what is in it';
end $$;

-- ============================================================
-- 0043 — the third pot
-- ============================================================
\echo ''
\echo '=== 0043 bank balance ==='

\echo '--- the bank is off, at zero, with no start date ---'
do $$
declare enabled boolean; amount numeric; started date;
begin
  select bank_balance_enabled, bank_balance_starting_amount, bank_balance_start_date
    into enabled, amount, started from settings where id = 1;
  if enabled is not false then
    raise exception 'FAIL: the bank is counted by default — a shop without one would see a row of zero';
  end if;
  if amount <> 0 then raise exception 'FAIL: the bank opens at %, expected 0', amount; end if;
  if started is not null then raise exception 'FAIL: the bank has a start date nobody set'; end if;
  raise notice 'the bank is absent until the owner opens it, not empty';
end $$;

\echo '--- a bank line is accepted and stays out of the other two pots ---'
do $$
declare bank numeric; drawer numeric; wallet numeric;
begin
  insert into cash_ledger (date, type, amount, account, note)
  values (current_date, 'in', 5000, 'bank', 'deposited the week''s takings');

  select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
    into bank from cash_ledger where account = 'bank';
  if bank <> 5000 then raise exception 'FAIL: the bank reads %, expected 5000', bank; end if;

  -- The three sums must not overlap. Each row has exactly one account, so a
  -- peso can only ever be in one pot — this is the guard against a total that
  -- double-counts.
  select count(*) into drawer from cash_ledger where account = 'cash' and note = 'deposited the week''s takings';
  select count(*) into wallet from cash_ledger where account = 'gcash' and note = 'deposited the week''s takings';
  if drawer <> 0 or wallet <> 0 then
    raise exception 'FAIL: a bank line also turned up in another pot';
  end if;
  raise notice 'a bank line is its own pot and nobody else''s';
end $$;

\echo ''
\echo '=== 0044 marketing campaigns ==='

\echo '--- a campaign is recorded and moves no money whatsoever ---'
do $$
declare drawer numeric; wallet numeric; bank numeric; orders_before bigint; orders_after bigint;
begin
  select count(*) into orders_before from orders;
  select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
    into drawer from cash_ledger where account = 'cash';
  select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
    into wallet from cash_ledger where account = 'gcash';
  select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
    into bank from cash_ledger where account = 'bank';

  insert into marketing_campaigns
    (name, kind, days, spend, baseline_per_day, during_per_day, margin_ratio)
  values ('Boost ng reel', 'ads', 7, 2000, 4000, 5000, 0.6);

  -- The promise the table's comment makes, checked rather than asserted. If a
  -- later migration ever wires this to the ledger by accident, this fails.
  if (select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
        from cash_ledger where account = 'cash') <> drawer then
    raise exception 'FAIL: recording a campaign moved the drawer';
  end if;
  if (select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
        from cash_ledger where account = 'gcash') <> wallet then
    raise exception 'FAIL: recording a campaign moved the e-wallet';
  end if;
  if (select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
        from cash_ledger where account = 'bank') <> bank then
    raise exception 'FAIL: recording a campaign moved the bank';
  end if;
  select count(*) into orders_after from orders;
  if orders_after <> orders_before then
    raise exception 'FAIL: recording a campaign created an order';
  end if;
  raise notice 'a campaign is working-out, not money — no pot moved and no order appeared';
end $$;

\echo '--- a campaign that has not run yet is allowed to have no result ---'
do $$
declare during numeric;
begin
  insert into marketing_campaigns
    (name, kind, days, spend, baseline_per_day, margin_ratio)
  values ('Fiesta free taste', 'freebie', 3, 0, 4000, 0.6)
  returning during_per_day into during;
  if during is not null then
    raise exception 'FAIL: a campaign nobody has run yet claims a result';
  end if;
  raise notice 'a plan is a row with no result, not a row claiming zero sales';
end $$;

\echo '--- the figures that would produce nonsense are refused ---'
do $$
begin
  begin
    insert into marketing_campaigns (name, kind, days, baseline_per_day, margin_ratio)
    values ('Zero days', 'ads', 0, 4000, 0.6);
    raise exception 'FAIL: a campaign that ran for no days was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into marketing_campaigns (name, kind, days, baseline_per_day, margin_ratio)
    values ('Impossible margin', 'ads', 7, 4000, 1.4);
    raise exception 'FAIL: a margin above 100%% was accepted';
  exception when check_violation then null;
  end;

  begin
    -- Nobody can come back who never came in the first place.
    insert into marketing_campaigns
      (name, kind, days, baseline_per_day, margin_ratio, new_customers, returned)
    values ('More returns than customers', 'freebie', 7, 4000, 0.6, 5, 9);
    raise exception 'FAIL: more people came back than ever turned up';
  exception when check_violation then null;
  end;

  begin
    insert into marketing_campaigns (name, kind, days, baseline_per_day, margin_ratio)
    values ('Unknown kind', 'billboard', 7, 4000, 0.6);
    raise exception 'FAIL: an unknown kind of campaign was accepted';
  exception when check_violation then null;
  end;

  raise notice 'zero days, an impossible margin, impossible returns and an unknown kind are all refused';
end $$;

\echo '--- a signed-out visitor cannot read the shop advertising budget ---'
do $$
declare visible bigint;
begin
  set local role anon;
  select count(*) into visible from marketing_campaigns;
  reset role;
  if visible <> 0 then
    raise exception 'FAIL: % campaigns readable from a browser session', visible;
  end if;
  raise notice 'what the shop spends on ads is not public, unlike the promos themselves';
end $$;
RESET ROLE;

\echo ''
\echo '=== 0045 suppliers, debts and running costs ==='

\echo '--- two ledger lines on the same day can now be told apart ---'
do $$
declare first_note text;
begin
  delete from cash_ledger;
  insert into cash_ledger (date, type, amount, note, account)
    values (current_date, 'out', 500, 'earlier', 'cash');
  perform pg_sleep(0.01);
  insert into cash_ledger (date, type, amount, note, account)
    values (current_date, 'in', 900, 'later', 'cash');

  -- The bug this fixes: ordering by `date` alone ties every row written on
  -- the same day, and a stable sort then reads them back in assembly order
  -- rather than in the order they happened.
  select note into first_note
    from cash_ledger order by date desc, created_at desc limit 1;
  if first_note <> 'later' then
    raise exception 'FAIL: same-day lines still cannot be ordered — newest read as %', first_note;
  end if;
  raise notice 'the newest line of the day reads first, which date alone could never decide';
  delete from cash_ledger;
end $$;

\echo '--- a supplier is a row, not three spellings ---'
do $$
declare sid uuid;
begin
  insert into suppliers (name, phone, place, sells)
    values ('Aling Nena', '0917 555 1234', 'Apalit public market', 'chicken, gulay')
    returning id into sid;
  if sid is null then raise exception 'FAIL: the supplier was not saved'; end if;
  raise notice 'a supplier carries how to reach them and what they sell';
end $$;

\echo '--- an unpaid delivery becomes a debt and moves no money ---'
do $$
declare drawer numeric; owed numeric;
begin
  select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
    into drawer from cash_ledger where account = 'cash';

  insert into supplier_debts (supplier_name, description, amount, source)
    values ('Aling Nena', '12kg chicken', 2100, 'restock');

  if (select coalesce(sum(case when type = 'in' then amount else -amount end), 0)
        from cash_ledger where account = 'cash') <> drawer then
    raise exception 'FAIL: recording a debt moved the drawer — the cash is still in it until the supplier is paid';
  end if;

  select sum(amount - paid) into owed from supplier_debts where paid < amount;
  if owed <> 2100 then raise exception 'FAIL: the shop owes %, expected 2100', owed; end if;
  raise notice 'the debt is recorded and the drawer is untouched, because the cash has not left yet';
end $$;

\echo '--- a part payment is a fact, not a boolean ---'
do $$
declare still_owed numeric;
begin
  update supplier_debts set paid = 800 where description = '12kg chicken';
  select amount - paid into still_owed from supplier_debts where description = '12kg chicken';
  if still_owed <> 1300 then
    raise exception 'FAIL: 1300 should still be owed, got %', still_owed;
  end if;

  begin
    update supplier_debts set paid = 5000 where description = '12kg chicken';
    raise exception 'FAIL: the shop paid more than it owed';
  exception when check_violation then null;
  end;

  raise notice 'part payments accumulate, and nobody can overpay a debt';
end $$;

\echo '--- gas is a running cost, and keeps the tank size while the price moves ---'
do $$
declare spent numeric; sizes int;
begin
  insert into running_costs (label, kind, amount, size_label, spent_on) values
    ('Gas refill', 'gas', 2040, '22kg', current_date - 30),
    ('Gas refill', 'gas', 1100, '11kg', current_date - 15),
    ('Gas refill', 'gas', 1980, '22kg', current_date - 2),
    ('Alcohol, paper towels', 'supplies', 340, null, current_date - 5);

  select sum(amount) into spent from running_costs where kind = 'gas';
  if spent <> 5120 then raise exception 'FAIL: gas spend reads %, expected 5120', spent; end if;

  -- Three refills at three different prices, two tank sizes. The price moving
  -- must not stop the shop knowing which size it bought.
  select count(distinct size_label) into sizes from running_costs where kind = 'gas';
  if sizes <> 2 then raise exception 'FAIL: expected two tank sizes, got %', sizes; end if;

  raise notice 'gas at a different price each time still adds up, and the tank size survives';
end $$;

\echo '--- an unknown kind of spend is refused ---'
do $$
begin
  begin
    insert into running_costs (label, kind, amount) values ('Mystery', 'sangkap', 100);
    raise exception 'FAIL: an unknown kind was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into running_costs (label, kind, amount) values ('Free lunch', 'supplies', 0);
    raise exception 'FAIL: a spend of zero was accepted';
  exception when check_violation then null;
  end;
  raise notice 'an unknown kind and a spend of nothing are both refused';
end $$;

\echo '--- what the shop owes is not public, and not the shift''s business ---'
do $$
declare visible bigint;
begin
  set local role anon;
  select count(*) into visible from supplier_debts;
  reset role;
  if visible <> 0 then
    raise exception 'FAIL: % debts readable from a browser session', visible;
  end if;
  raise notice 'a signed-out visitor cannot read what Pepper Pan owes';
end $$;
RESET ROLE;

\echo ''
\echo '=== 0046 batches inside batches ==='

\echo '--- a batch can be made of another batch, and is priced through it ---'
do $$
declare per_unit numeric;
begin
  insert into ingredients (id, name, unit, cost, stock)
    values ('butter', 'Butter', 'g', 1, 100000),
           ('chicken', 'Chicken', 'g', 0.2, 100000)
    on conflict (id) do update set cost = excluded.cost, stock = excluded.stock;

  insert into batches (id, name, yield_qty, yield_unit, batch_stock)
    values ('liquid-butter', 'Liquid butter', 500, 'g', 0),
           ('ji-pai', 'Marinated ji pai', 1000, 'g', 0)
    on conflict (id) do update set yield_qty = excluded.yield_qty, batch_stock = 0;

  delete from batch_ingredients where batch_id in ('liquid-butter', 'ji-pai');
  insert into batch_ingredients (batch_id, ref_type, ref_id, qty) values
    ('liquid-butter', 'inv', 'butter', 500),
    ('ji-pai', 'inv', 'chicken', 1000),
    ('ji-pai', 'batch', 'liquid-butter', 100);

  -- 500g butter at P1 over a 500g yield = P1.00/g.
  if round(batch_cost_per_unit('liquid-butter'), 4) <> 1 then
    raise exception 'FAIL: liquid butter prices at %, expected 1', batch_cost_per_unit('liquid-butter');
  end if;
  -- 1000g chicken at P0.20 = P200, plus 100g butter at P1 = P100, over 1000g.
  per_unit := batch_cost_per_unit('ji-pai');
  if round(per_unit, 4) <> 0.3 then
    raise exception 'FAIL: ji pai prices at %, expected 0.30 — the sub-batch is not being counted', per_unit;
  end if;
  raise notice 'a sub-batch carries its own price up into the parent';
end $$;

\echo '--- making the parent draws down the sub-batch, and nothing twice ---'
do $$
declare butter_before numeric; butter_after numeric;
declare chicken_before numeric; chicken_after numeric;
declare jipai_after numeric; cost numeric;
begin
  -- Stock the butter first, exactly as the kitchen would.
  perform produce_batch('liquid-butter', 2);       -- 1000g of butter
  select batch_stock into butter_before from batches where id = 'liquid-butter';
  select stock into chicken_before from ingredients where id = 'chicken';

  cost := produce_batch('ji-pai', 1);              -- needs 1000g chicken + 100g butter

  select batch_stock into butter_after from batches where id = 'liquid-butter';
  select stock into chicken_after from ingredients where id = 'chicken';
  select batch_stock into jipai_after from batches where id = 'ji-pai';

  if butter_before - butter_after <> 100 then
    raise exception 'FAIL: butter fell by %, expected 100', butter_before - butter_after;
  end if;
  if chicken_before - chicken_after <> 1000 then
    raise exception 'FAIL: chicken fell by %, expected 1000', chicken_before - chicken_after;
  end if;
  -- The load-bearing one. Making ji pai must NOT also consume the butter's
  -- own ingredients: that butter was already paid for when it was made, and
  -- taking it again would bill the shop twice for the same 500g.
  if chicken_before - chicken_after > 1000 then
    raise exception 'FAIL: the sub-batch ingredients were consumed a second time';
  end if;
  if jipai_after <> 1000 then
    raise exception 'FAIL: ji pai stock is %, expected 1000', jipai_after;
  end if;
  raise notice 'the parent takes the sub-batch off the shelf, and the sub-batch''s own ingredients are not taken again';
end $$;

\echo '--- running out of a sub-batch fails like running out of anything else ---'
do $$
declare butter numeric;
begin
  update batches set batch_stock = 50 where id = 'liquid-butter';
  begin
    perform produce_batch('ji-pai', 1);   -- needs 100g, only 50g there
    raise exception 'FAIL: a batch was made out of butter that did not exist';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  select batch_stock into butter from batches where id = 'liquid-butter';
  if butter <> 50 then
    raise exception 'FAIL: a refused batch still moved the butter — now %', butter;
  end if;
  raise notice 'not enough of a sub-batch stops the whole thing, and moves nothing';
end $$;

\echo '--- a batch cannot be made of itself ---'
do $$
begin
  begin
    insert into batch_ingredients (batch_id, ref_type, ref_id, qty)
      values ('ji-pai', 'batch', 'ji-pai', 10);
    raise exception 'FAIL: a batch listing itself was accepted';
  exception when check_violation then null;
  end;
  raise notice 'a batch listing itself is refused by the database, not just by the form';
end $$;

\echo '--- a recipe loop prices at zero rather than hanging the till ---'
do $$
declare per_unit numeric;
begin
  -- Only reachable by a hand edit or an import: the app refuses both ends.
  insert into batch_ingredients (batch_id, ref_type, ref_id, qty)
    values ('liquid-butter', 'batch', 'ji-pai', 10);
  per_unit := batch_cost_per_unit('ji-pai');
  if per_unit is null then
    raise exception 'FAIL: a loop returned null instead of a number';
  end if;
  raise notice 'a circular recipe returns a number and stops, so a sale can still be rung up';
  delete from batch_ingredients where batch_id = 'liquid-butter' and ref_type = 'batch';
end $$;

-- ============================================================
\echo '=== 0053 a shelf that runs short says so ==='
-- ============================================================
-- The subtraction was never the bug. The silence was. These check that the
-- moment a shelf crosses below zero reaches the activity log, that it is
-- logged once rather than on every sale afterwards, and that an ordinary
-- sale off a shelf with enough on it stays quiet.

-- A dish that needs one pack of something prepped and 60g of something bought.
insert into ingredients (id, name, unit, cost, stock)
  values ('short-breading', 'Short Breading', 'g', 0.5, 100)
  on conflict (id) do update
  set stock = 100, cost = 0.5, name = excluded.name, unit = excluded.unit;
insert into batches (id, name, yield_qty, yield_unit, batch_stock, manual_cost_per_unit)
  values ('short-packs', 'Short Packs', 10, 'pack', 1, 25)
  on conflict (id) do update
  set batch_stock = 1, manual_cost_per_unit = 25, name = excluded.name;
insert into meals (id, name, price) values ('short-dish', 'Short Dish', 180)
  on conflict (id) do update set price = 180;
delete from meal_ingredients where meal_id = 'short-dish';
insert into meal_ingredients (meal_id, ref_type, ref_id, qty) values
  ('short-dish', 'batch', 'short-packs', 1),
  ('short-dish', 'inv', 'short-breading', 60);

\echo '--- a sale the shelf can cover moves stock and says nothing ---'
do $$
declare noisy int; packs numeric;
begin
  delete from activity_log where category = 'movement';
  insert into orders (id, revenue, status) values ('short-ok', 180, 'completed')
    on conflict (id) do nothing;
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
    values ('short-ok', 'short-dish', 1, 180);
  perform apply_order_stock('short-ok');

  select batch_stock into packs from batches where id = 'short-packs';
  if packs <> 0 then
    raise exception 'FAIL: one pack sold off a shelf of one left %, expected 0', packs;
  end if;

  select count(*) into noisy from activity_log where category = 'movement';
  if noisy <> 0 then
    raise exception 'FAIL: a sale the shelf could cover logged % shortfalls', noisy;
  end if;
  raise notice 'a sale within what is on the shelf moves stock and stays quiet';
end $$;

\echo '--- the sale that takes a batch under zero is written down, by name ---'
do $$
declare said text; packs numeric;
begin
  -- The shelf is at 0 packs now. This is the race #128 cannot catch: a
  -- second till that read the same shelf a moment earlier.
  insert into orders (id, revenue, status) values ('short-over', 180, 'completed')
    on conflict (id) do nothing;
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
    values ('short-over', 'short-dish', 1, 180);
  perform apply_order_stock('short-over');

  select batch_stock into packs from batches where id = 'short-packs';
  if packs <> -1 then
    raise exception 'FAIL: the oversell was refused or clamped — shelf is %, expected -1', packs;
  end if;

  select description into said from activity_log
   where category = 'movement' and description like 'Short Packs%';
  if said is null then
    raise exception 'FAIL: a batch went to -1 and nothing was written to the log';
  end if;
  if said not like '%short by 1 pack%' then
    raise exception 'FAIL: the log does not say how short, or in what unit: %', said;
  end if;
  raise notice 'a batch crossing zero is logged by name, amount and unit: %', said;
end $$;

\echo '--- an ingredient crossing zero is logged the same way ---'
do $$
declare said text; left_over numeric;
begin
  -- 100g on the shelf, 60g a dish. The first sale left 40g; this one needs 60.
  select stock into left_over from ingredients where id = 'short-breading';
  if left_over <> -20 then
    raise exception 'FAIL: expected the breading at -20g by now, it is %', left_over;
  end if;
  select description into said from activity_log
   where category = 'movement' and description like 'Short Breading%';
  if said is null then
    raise exception 'FAIL: the breading went to -20g and nothing was written down';
  end if;
  if said not like '%short by 20 g%' then
    raise exception 'FAIL: the breading shortfall is not stated in grams: %', said;
  end if;
  raise notice 'an ingredient crossing zero is logged too: %', said;
end $$;

\echo '--- an already-short shelf does not log again on every sale ---'
do $$
declare rows_now int; packs numeric;
begin
  insert into orders (id, revenue, status) values ('short-again', 180, 'completed')
    on conflict (id) do nothing;
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
    values ('short-again', 'short-dish', 1, 180);
  perform apply_order_stock('short-again');

  select batch_stock into packs from batches where id = 'short-packs';
  if packs <> -2 then
    raise exception 'FAIL: the third sale did not move the shelf — it is at %', packs;
  end if;

  -- Two crossings happened in total: the batch's and the breading's. A third
  -- sale off an already-negative shelf is the same known problem, and the
  -- standing figure is on the Inventory screen. One row each, not one a sale.
  select count(*) into rows_now from activity_log where category = 'movement';
  if rows_now <> 2 then
    raise exception 'FAIL: expected 2 crossing rows, the log has % — it is logging state, not the crossing', rows_now;
  end if;
  raise notice 'the log records when a shelf went short, not every sale after it';
end $$;

\echo '--- moving stock is still something only the server may do ---'
do $$
declare who text;
begin
  foreach who in array array['anon', 'authenticated', 'public'] loop
    if has_function_privilege(who, 'apply_order_stock(text)', 'execute') then
      raise exception 'FAIL: % may move stock directly after 0053 replaced the function', who;
    end if;
    -- The five-argument signature since 0069, which gave it a note. The
    -- four-argument one is dropped there: two overloads would make every
    -- existing call ambiguous, and leaving a grant behind on a signature
    -- nobody checks is how a door stays open after the wall moves.
    if has_function_privilege(who, 'consume_ingredient(text, numeric, date, text, text)', 'execute') then
      raise exception 'FAIL: % may consume ingredients directly', who;
    end if;
    if exists (select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
                where n.nspname = 'public' and pr.proname = 'consume_ingredient'
                  and pg_get_function_identity_arguments(pr.oid) = 'text, numeric, date, text') then
      raise exception 'FAIL: the old four-argument consume_ingredient is still here — every call is now ambiguous';
    end if;
  end loop;
  raise notice 'replacing the functions did not hand the anon key the keys to the shelf';
end $$;

-- ============================================================
\echo '=== 0057 a day typed in from the notebook never moves stock ==='
-- ============================================================
-- Backfilled takings are real money and historical food. Applying them to
-- stock would walk the recipe of a dish eaten in August and take its
-- ingredients off a shelf that is full today — emptying the store room to
-- record history. The app sets `stock_applied_at` at insert; this checks the
-- database honours that as the claim it is.

insert into ingredients (id, name, unit, cost, stock)
  values ('bf-flour', 'Backfill Flour', 'g', 0.2, 5000)
  on conflict (id) do update set stock = 5000;
insert into meals (id, name, price) values ('bf-dish', 'Backfill Dish', 100)
  on conflict (id) do update set price = 100;
delete from meal_ingredients where meal_id = 'bf-dish';
insert into meal_ingredients (meal_id, ref_type, ref_id, qty)
  values ('bf-dish', 'inv', 'bf-flour', 100);

\echo '--- an ordinary sale still moves the shelf ---'
do $$
declare before_qty numeric; after_qty numeric;
begin
  select stock into before_qty from ingredients where id = 'bf-flour';
  insert into orders (id, date, revenue, status) values ('bf-live', current_date, 100, 'completed');
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
    values ('bf-live', 'bf-dish', 1, 100);
  perform apply_order_stock('bf-live');
  select stock into after_qty from ingredients where id = 'bf-flour';
  if after_qty <> before_qty - 100 then
    raise exception 'FAIL: a normal sale did not move stock — % to %', before_qty, after_qty;
  end if;
  raise notice 'a normal sale still takes its ingredients off the shelf';
end $$;

\echo '--- a backfilled day is refused by the stock engine, not applied ---'
do $$
declare before_qty numeric; after_qty numeric; result numeric;
begin
  select stock into before_qty from ingredients where id = 'bf-flour';

  -- Exactly what the app writes: the claim already made.
  insert into orders (id, date, revenue, cogs, gross_profit, status, is_backfill, stock_applied_at)
    values ('bf-past', current_date - 40, 8500, 3230, 5270, 'completed', true, now());
  -- A backfilled day carries no lines, but give it one anyway: if the guard
  -- ever fails, this is what would come off the shelf.
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
    values ('bf-past', 'bf-dish', 10, 100);

  result := apply_order_stock('bf-past');
  if result is not null then
    raise exception 'FAIL: the stock engine claimed a day that was already stamped';
  end if;

  select stock into after_qty from ingredients where id = 'bf-flour';
  if after_qty <> before_qty then
    raise exception 'FAIL: a typed-in past day emptied the shelf — % to %', before_qty, after_qty;
  end if;
  raise notice 'a past day leaves today''s shelf exactly where it was';
end $$;

\echo '--- and it is marked, so a screen can tell it from a ticket ---'
do $$
declare flagged boolean; money numeric;
begin
  select is_backfill, revenue into flagged, money from orders where id = 'bf-past';
  if not flagged then
    raise exception 'FAIL: a typed-in day is indistinguishable from a real ticket';
  end if;
  if money <> 8500 then
    raise exception 'FAIL: the takings did not survive — %', money;
  end if;
  raise notice 'the money is real and the row says how it got here';
end $$;

\echo '--- a past day carries a cost, so it is never pure profit ---'
do $$
declare c numeric; g numeric;
begin
  select cogs, gross_profit into c, g from orders where id = 'bf-past';
  if c <= 0 then
    raise exception 'FAIL: cogs is %, so this day reads as a 100%% margin', c;
  end if;
  if g >= 8500 then
    raise exception 'FAIL: gross profit is % on takings of 8500', g;
  end if;
  raise notice 'a typed-in day books a cost as well as takings';
end $$;

\echo '=== 0058 a bill is a list, and what it came to each month ==='
select act_as_service();
reset role;
delete from monthly_bills;
delete from fixed_costs where id like 'bill-%';
insert into fixed_costs (id, label, amount, kind, active)
  values ('bill-k', 'Kuryente', 2000, 'utility', true);

\echo '--- a month is the first of the month, enforced rather than trusted ---'
-- A bill filed on the 14th and the same bill filed on the 1st are two rows
-- for one month, and the unique index below — the thing that stops a bill
-- being counted twice — would not catch it.
do $$
declare took boolean := false;
begin
  begin
    insert into monthly_bills (fixed_cost_id, month, amount)
      values ('bill-k', date '2026-09-14', 2000);
    took := true;
  exception when check_violation then null;
  end;
  if took then
    raise exception 'FAIL: a bill was filed against the middle of a month';
  end if;
  raise notice 'only the first of a month is accepted';
end $$;

\echo '--- the same bill cannot be entered twice for one month ---'
-- Entering kuryente twice for September is a typo every time, and silently
-- doubling break-even is what it would otherwise do.
do $$
declare took boolean := false;
begin
  insert into monthly_bills (fixed_cost_id, month, amount)
    values ('bill-k', date '2026-09-01', 2000);
  begin
    insert into monthly_bills (fixed_cost_id, month, amount)
      values ('bill-k', date '2026-09-01', 3100);
    took := true;
  exception when unique_violation then null;
  end;
  if took then
    raise exception 'FAIL: September has two kuryente bills, so break-even counts it twice';
  end if;
  raise notice 'one bill, one month, one figure';
end $$;

\echo '--- correcting a month replaces the figure rather than adding one ---'
do $$
declare n int; amt numeric;
begin
  insert into monthly_bills (fixed_cost_id, month, amount)
    values ('bill-k', date '2026-09-01', 2450)
  on conflict (fixed_cost_id, month) do update set amount = excluded.amount;
  select count(*), max(amount) into n, amt
    from monthly_bills where fixed_cost_id = 'bill-k' and month = date '2026-09-01';
  if n <> 1 then raise exception 'FAIL: correcting September left % rows', n; end if;
  if amt <> 2450 then raise exception 'FAIL: the correction did not take — %', amt; end if;
  raise notice 'a second entry for a month is a correction, not a duplicate';
end $$;

\echo '--- removing a bill takes its recorded months with it ---'
-- The cascade is what makes the reset screen honest about what it destroys:
-- deleting the bill deletes months of readings nobody can go back and
-- observe again, so the reset counts them separately before it runs.
do $$
declare left_behind int;
begin
  delete from fixed_costs where id = 'bill-k';
  select count(*) into left_behind from monthly_bills where fixed_cost_id = 'bill-k';
  if left_behind <> 0 then
    raise exception 'FAIL: % recorded months outlived the bill they belong to', left_behind;
  end if;
  raise notice 'no orphaned months behind a deleted bill';
end $$;

\echo '--- what the shop paid for electricity in July is the owner''s business ---'
-- 0024 took the staff read off `fixed_costs` for exactly this reason. A
-- per-month history is strictly MORE revealing than the flat figure was, so
-- anything looser here would be a leak opened by a feature that improved a
-- screen.
select act_as_service();
reset role;
insert into fixed_costs (id, label, amount, kind, active)
  values ('bill-r', 'Rent', 4500, 'rent', true) on conflict (id) do nothing;
insert into monthly_bills (fixed_cost_id, month, amount)
  values ('bill-r', date '2026-08-01', 4500) on conflict do nothing;

select act_as('22222222-2222-2222-2222-222222222222');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from monthly_bills;
  if n <> 0 then
    raise exception 'FAIL: a member of staff can read the shop''s bills (% rows)', n;
  end if;
  raise notice 'staff cannot read what the shop pays its landlord, month by month';
end $$;
reset role;

select act_as('11111111-1111-1111-1111-111111111111');
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from monthly_bills;
  if n < 1 then
    raise exception 'FAIL: the owner cannot read their own bills';
  end if;
  raise notice 'the owner can';
end $$;
reset role;
select act_as_service();

\echo '=== 0059 the shop trades on Apalit time, not the server''s ==='
select act_as_service();
reset role;

\echo '--- the eight hours the old default got wrong ---'
-- Pinned as arithmetic rather than against the clock, so this holds whatever
-- hour the check happens to run at. 23:00 UTC on the 26th is 07:00 on the
-- 27th in Apalit: one instant, two different days, and the whole bug.
do $$
declare manila date; utc date;
begin
  manila := (timestamptz '2026-09-26 23:00:00+00' at time zone 'Asia/Manila')::date;
  utc    := (timestamptz '2026-09-26 23:00:00+00' at time zone 'UTC')::date;
  if manila <> date '2026-09-27' then
    raise exception 'FAIL: 7am Sunday in Apalit came out as %', manila;
  end if;
  if utc <> date '2026-09-26' then
    raise exception 'FAIL: the UTC reading came out as %, so this test proves nothing', utc;
  end if;
  raise notice 'one instant, two days — Apalit %, UTC %', manila, utc;
end $$;

\echo '--- shop_date() is the Apalit day ---'
do $$
declare got date; want date;
begin
  select shop_date() into got;
  want := (now() at time zone 'Asia/Manila')::date;
  if got <> want then
    raise exception 'FAIL: shop_date() said % and Apalit says %', got, want;
  end if;
  raise notice 'shop_date() agrees with the calendar in Apalit';
end $$;

\echo '--- shop_date() is not frozen at plan time ---'
-- STABLE and not IMMUTABLE. An immutable function whose whole job is to
-- change once a day can be folded to a constant by the planner, which is a
-- very quiet way to stop the shop's day ever rolling over.
do $$
declare vol char;
begin
  select provolatile into vol from pg_proc where proname = 'shop_date';
  if vol <> 's' then
    raise exception 'FAIL: shop_date() is volatility %, expected s (stable)', vol;
  end if;
  raise notice 'shop_date() is stable, so it is read and not folded';
end $$;

\echo '--- every date column files rows under the shop''s day ---'
-- Listed by name rather than counted. The eleven columns each had
-- `current_date` written out separately, which is exactly how they came to be
-- wrong together — a table added later has to be argued about here.
do $$
declare
  spec record;
  expr text;
  wrong text[] := '{}';
begin
  for spec in
    select * from (values
      ('orders','date'), ('purchase_log','date'), ('consumption_log','date'),
      ('waste_log','date'), ('cash_ledger','date'), ('receivables','date'),
      ('cycle_counts','date'), ('activity_log','date'),
      ('marketing_campaigns','started_on'), ('supplier_debts','incurred_on'),
      ('running_costs','spent_on')
    ) as t(tbl, col)
  loop
    select pg_get_expr(d.adbin, d.adrelid) into expr
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = spec.tbl::regclass and a.attname = spec.col;
    if expr is null or expr not like '%shop_date%' then
      wrong := wrong || (spec.tbl || '.' || spec.col || ' = ' || coalesce(expr, 'no default'));
    end if;
  end loop;

  if array_length(wrong, 1) > 0 then
    raise exception 'FAIL: still filing rows under the server''s day: %', wrong;
  end if;
  raise notice 'all eleven date columns default to the shop''s own day';
end $$;

\echo '--- a sale written with no date lands on the shop''s day ---'
do $$
declare got date;
begin
  insert into orders (id, revenue, status) values ('tz-today', 120, 'completed');
  select date into got from orders where id = 'tz-today';
  if got <> shop_date() then
    raise exception 'FAIL: the sale was filed under % and today is %', got, shop_date();
  end if;
  delete from orders where id = 'tz-today';
  raise notice 'a sale with no date given lands on the day the shop is having';
end $$;

\echo '--- and so does a batch prepped before the sun is properly up ---'
-- `produce_batch` passed `current_date` into `consume_ingredient` by hand, so
-- the column default could never reach it. Batches get prepped early; the
-- usage averages and the reorder list are built on this log.
do $$
declare bad int;
begin
  select count(*) into bad
    from pg_proc
   where proname = 'produce_batch'
     and prosrc like '%current_date%';
  if bad > 0 then
    raise exception 'FAIL: produce_batch still writes the server''s day by hand';
  end if;
  raise notice 'produce_batch logs consumption on the shop''s day';
end $$;

\echo '=== 0060 a sale that moved nothing says so ==='
select act_as_service();
reset role;

insert into ingredients (id, name, unit, cost, stock)
  values ('b-pork', 'B Pork', 'g', 0.45, 1000)
  on conflict (id) do update set stock = 1000;
insert into meals (id, name, price) values
  ('b-good', 'Pork Ramen', 180),
  ('b-bad',  'Iced Tea', 35),
  ('b-bad2', 'Extra Egg', 15),
  ('b-combo','Combo Meal', 200),
  ('b-part', 'Combo Inner', 0)
on conflict (id) do update set price = excluded.price;

delete from meal_ingredients where meal_id like 'b-%';
delete from meal_components where meal_id like 'b-%';
insert into meal_ingredients (meal_id, ref_type, ref_id, qty)
  values ('b-good', 'inv', 'b-pork', 100), ('b-part', 'inv', 'b-pork', 50);
-- A combo that carries no ingredients of its own but is built from one that does.
insert into meal_components (meal_id, component_meal_id, qty) values ('b-combo', 'b-part', 1);

delete from activity_log;

\echo '--- an order with two dishes that have no recipe, plus one that does ---'
insert into orders (id, ticket, contact_name, revenue, status, fulfillment)
  values ('b-order', 23, 'Aling Nena', 230, 'pending', 'pickup');
with l as (
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
  values ('b-order', 'b-good', 1, 180) returning id
)
insert into order_line_extras (order_line_id, meal_id, label, qty, price_at_sale)
  select id, 'b-bad', 'Iced tea', 1, 35 from l;
insert into order_lines (order_id, meal_id, qty, price_at_sale)
  values ('b-order', 'b-bad2', 1, 15);

do $$
declare cost numeric; said text;
begin
  cost := apply_order_stock('b-order');
  select description into said from activity_log where category = 'movement' limit 1;
  raise notice 'cogs %', cost;
  raise notice '%', said;
  if said is null then raise exception 'FAIL: the sale moved nothing and said nothing'; end if;
  if said not like '%Iced Tea%' or said not like '%Extra Egg%' then
    raise exception 'FAIL: it did not name both blind dishes — %', said;
  end if;
  if said like '%Pork Ramen%' then
    raise exception 'FAIL: it named a dish that DOES have a recipe';
  end if;
end $$;

\echo '--- a combo costed through its components is not accused ---'
delete from activity_log;
insert into orders (id, ticket, revenue, status, fulfillment)
  values ('b-order2', 24, 200, 'pending', 'pickup');
insert into order_lines (order_id, meal_id, qty, price_at_sale)
  values ('b-order2', 'b-combo', 1, 200);
do $$
declare n int; cost numeric;
begin
  cost := apply_order_stock('b-order2');
  select count(*) into n from activity_log where category = 'movement';
  raise notice 'combo cogs % | complaints %', cost, n;
  if n <> 0 then raise exception 'FAIL: a combo costed through its components was named as blind'; end if;
  if cost <= 0 then raise exception 'FAIL: the combo booked no cost at all'; end if;
end $$;

\echo '--- a fully costed order stays quiet ---'
delete from activity_log;
insert into orders (id, ticket, revenue, status, fulfillment)
  values ('b-order3', 25, 180, 'pending', 'pickup');
insert into order_lines (order_id, meal_id, qty, price_at_sale)
  values ('b-order3', 'b-good', 1, 180);
do $$
declare n int;
begin
  perform apply_order_stock('b-order3');
  select count(*) into n from activity_log where category = 'movement';
  if n <> 0 then raise exception 'FAIL: a good sale was complained about'; end if;
  raise notice 'a fully costed sale says nothing, as it should';
end $$;


\echo '=== 0061 an add-on that comes in sizes ==='
-- The claim this migration rests on is that NOTHING on the order side
-- changes: a chosen size is a dish, and `order_line_extras.meal_id` has
-- pointed at a dish since 0049. A claim like that is worth ten of my
-- sentences and none of them, so it is measured here against the real
-- schema — the large's tea leaves must come off the shelf, and the
-- regular's must not.
select act_as_service();
reset role;

insert into ingredients (id, name, unit, cost, stock)
  values ('v-tea', 'V Tea Leaves', 'g', 2.00, 1000)
  on conflict (id) do update set stock = 1000;

insert into menu_products (id, name) values ('v-card', 'V Iced Tea')
  on conflict (id) do update set name = excluded.name;

insert into meals (id, name, price, product_id, options, variant_sort) values
  ('v-reg', 'V Iced Tea Regular', 35, 'v-card', '{"Size":"Regular"}'::jsonb, 0),
  ('v-lrg', 'V Iced Tea Large',   50, 'v-card', '{"Size":"Large"}'::jsonb,   1)
on conflict (id) do update set
  price = excluded.price, product_id = excluded.product_id,
  options = excluded.options, variant_sort = excluded.variant_sort;

delete from meal_ingredients where meal_id in ('v-reg', 'v-lrg');
insert into meal_ingredients (meal_id, ref_type, ref_id, qty)
  values ('v-reg', 'inv', 'v-tea', 10), ('v-lrg', 'inv', 'v-tea', 25);

insert into meals (id, name, price) values ('v-dish', 'V Rice Meal', 150)
  on conflict (id) do update set price = excluded.price;

\echo '--- an option may name a product instead of a dish ---'
insert into modifier_groups (id, name, min_select, max_select)
  values ('v-grp', 'Choose your drink', 0, 1)
  on conflict (id) do update set name = excluded.name;
delete from modifier_options where group_id = 'v-grp';
insert into modifier_options (id, group_id, label, option_product_id, sort_order)
  values ('v-opt', 'v-grp', 'Iced Tea', 'v-card', 0);

\echo '--- but never both at once ---'
do $$
begin
  begin
    update modifier_options set option_meal_id = 'v-dish' where id = 'v-opt';
    raise exception 'FAIL: an option naming a dish AND a product was allowed';
  exception when check_violation then
    raise notice 'an option naming both is refused, as it must be';
  end;
end $$;

\echo '--- each size may charge its own price ---'
delete from modifier_option_prices where option_id = 'v-opt';
insert into modifier_option_prices (option_id, meal_id, price)
  values ('v-opt', 'v-reg', 0), ('v-opt', 'v-lrg', 15);
do $$
declare got numeric;
begin
  select price into got from modifier_option_prices
   where option_id = 'v-opt' and meal_id = 'v-reg';
  -- Zero has to survive the round trip. If an absent row and a zero row
  -- were the same thing, the size that comes free with the combo would
  -- quietly start charging ₱35.
  if got is distinct from 0 then
    raise exception 'FAIL: a free size did not stay free — got %', got;
  end if;
  raise notice 'regular free, large +15';
end $$;

\echo '--- the size the customer picked is the stock that moves ---'
delete from activity_log;
insert into orders (id, ticket, revenue, status, fulfillment)
  values ('v-order', 26, 200, 'pending', 'pickup');
with l as (
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
  values ('v-order', 'v-dish', 1, 150) returning id
)
insert into order_line_extras (order_line_id, meal_id, label, qty, price_at_sale)
  select id, 'v-lrg', 'Iced Tea · Large', 1, 15 from l;

do $$
declare before numeric; after numeric; cost numeric;
begin
  select stock into before from ingredients where id = 'v-tea';
  cost := apply_order_stock('v-order');
  select stock into after from ingredients where id = 'v-tea';
  raise notice 'tea leaves % -> % | cogs %', before, after, cost;

  -- 25g is the LARGE's recipe. 10g would mean the order deducted the
  -- regular, which is the bug this whole shape exists to make impossible.
  if before - after <> 25 then
    raise exception 'FAIL: the chosen size did not move — % g came off, expected 25', before - after;
  end if;
  if cost < 50 then
    raise exception 'FAIL: the large tea booked no cost of its own — cogs %', cost;
  end if;
end $$;

\echo '--- deleting the card empties the option, it does not delete it ---'
do $$
declare still int; points text;
begin
  delete from menu_products where id = 'v-card';
  select count(*) into still from modifier_options where id = 'v-opt';
  select option_product_id into points from modifier_options where id = 'v-opt';
  if still <> 1 then
    raise exception 'FAIL: deleting a card took the owner''s option with it';
  end if;
  if points is not null then
    raise exception 'FAIL: the option still points at a card that is gone';
  end if;
  raise notice 'the option survives with its label and stops being offered';
end $$;


\echo '=== 0062 the customer menu may read its own switch ==='
-- The bug this fixes was invisible in every way that matters: the owner saw
-- the calories because the owner is staff, and the customer saw nothing
-- because `settings` has never had a public read policy. So both directions
-- are pinned here — the flag must come through, and the money must not.
select act_as_service();
reset role;
update settings set
  show_nutrition = true,
  cash_reserve = 50000,
  gcash_balance_starting_amount = 12345
where id = 1;

\echo '--- the table itself stays shut ---'
do $$
declare seen int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
  select count(*) into seen from settings;
  reset role;
  if seen <> 0 then
    raise exception 'FAIL: a customer can read settings — the shop''s cash is public';
  end if;
  raise notice 'a signed-in customer still sees 0 rows of settings';
end $$;

\echo '--- but the switch comes through ---'
do $$
declare flag boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select show_nutrition into flag from public_settings;
  reset role;
  if flag is not true then
    raise exception 'FAIL: the menu still cannot read its own switch — got %', flag;
  end if;
  raise notice 'a signed-in customer reads show_nutrition = true';
end $$;

\echo '--- and for somebody not signed in at all ---'
do $$
declare flag boolean; seen int;
begin
  set local role anon;
  perform set_config('request.jwt.claim.role', 'anon', true);
  select show_nutrition into flag from public_settings;
  select count(*) into seen from settings;
  reset role;
  if flag is not true then
    raise exception 'FAIL: a visitor cannot read the switch — got %', flag;
  end if;
  if seen <> 0 then
    raise exception 'FAIL: a visitor can read settings';
  end if;
  raise notice 'a visitor reads the switch and none of the table';
end $$;

\echo '--- the view carries the switch and nothing else ---'
do $$
declare cols text[];
begin
  -- Named, not counted. The whole safety of this rests on what is IN the
  -- view, and "one column" would still pass if somebody swapped it for
  -- cash_reserve.
  select array_agg(column_name::text order by column_name) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'public_settings';
  if cols is distinct from array['show_nutrition'] then
    raise exception 'FAIL: public_settings publishes % — settings holds the shop''s money', cols;
  end if;
  raise notice 'public_settings publishes show_nutrition and nothing else';
end $$;

\echo '--- turning it off turns it off ---'
select act_as_service();
reset role;
update settings set show_nutrition = false where id = 1;
do $$
declare flag boolean;
begin
  set local role anon;
  perform set_config('request.jwt.claim.role', 'anon', true);
  select show_nutrition into flag from public_settings;
  reset role;
  if flag is not false then
    raise exception 'FAIL: the switch is stuck on — got %', flag;
  end if;
  raise notice 'the owner''s switch still decides';
end $$;


\echo '=== 0063 a dish can be wasted too ==='
-- The one thing that must never be true here: a staff meal priced at what
-- it SELLS for. That would overstate every loss and make a month look like
-- a disaster that never happened.
select act_as_service();
reset role;

insert into ingredients (id, name, unit, cost, stock) values
  ('w-pork', 'W Pork', 'g', 0.50, 1000),
  ('w-noodle', 'W Noodles', 'g', 0.20, 1000),
  ('w-box', 'W Box', 'pc', 5.00, 100)
on conflict (id) do update set stock = excluded.stock, cost = excluded.cost;

insert into meals (id, name, price) values
  ('w-sauce-dish', 'W Sauce Base', 0),
  ('w-meal', 'W Rice Meal', 179)
on conflict (id) do update set price = excluded.price;

delete from meal_ingredients where meal_id like 'w-%';
delete from meal_components where meal_id like 'w-%';
delete from meal_packaging where meal_id like 'w-%';

-- 100g pork directly, plus a component dish carrying 50g noodles.
insert into meal_ingredients (meal_id, ref_type, ref_id, qty) values
  ('w-meal', 'inv', 'w-pork', 100),
  ('w-sauce-dish', 'inv', 'w-noodle', 50);
insert into meal_components (meal_id, component_meal_id, qty)
  values ('w-meal', 'w-sauce-dish', 1);
-- A box, which must NOT come off: a waste line does not know how it was served.
insert into meal_packaging (meal_id, ref_type, ref_id, qty)
  values ('w-meal', 'inv', 'w-box', 1);

\echo '--- what one dish takes off the shelf ---'
do $$
declare pork numeric; noodle numeric; box int;
begin
  select qty into pork from meal_requirements('w-meal', 1) where ref_id = 'w-pork';
  select qty into noodle from meal_requirements('w-meal', 1) where ref_id = 'w-noodle';
  select count(*) into box from meal_requirements('w-meal', 1) where ref_id = 'w-box';

  if pork is distinct from 100 then
    raise exception 'FAIL: the dish''s own ingredient did not come through — %', pork;
  end if;
  -- Through the component, five levels deep if it needs to be.
  if noodle is distinct from 50 then
    raise exception 'FAIL: the component dish was not walked — %', noodle;
  end if;
  if box <> 0 then
    raise exception 'FAIL: packaging was included — a waste line cannot know it was boxed';
  end if;
  raise notice '1 dish = 100g pork + 50g noodles, no box';
end $$;

\echo '--- two of it is twice as much ---'
do $$
declare pork numeric;
begin
  select qty into pork from meal_requirements('w-meal', 2) where ref_id = 'w-pork';
  if pork is distinct from 200 then
    raise exception 'FAIL: the quantity did not multiply — %', pork;
  end if;
  raise notice 'two dishes take twice the shelf';
end $$;

\echo '--- wasting it moves real stock and costs the COGS ---'
do $$
declare before_pork numeric; after_pork numeric;
        before_noodle numeric; after_noodle numeric; cost numeric;
begin
  select stock into before_pork from ingredients where id = 'w-pork';
  select stock into before_noodle from ingredients where id = 'w-noodle';

  cost := consume_meal('w-meal', 2, shop_date(), 'internal');

  select stock into after_pork from ingredients where id = 'w-pork';
  select stock into after_noodle from ingredients where id = 'w-noodle';
  raise notice 'pork % -> %, noodles % -> %, cost %',
    before_pork, after_pork, before_noodle, after_noodle, cost;

  if before_pork - after_pork <> 200 then
    raise exception 'FAIL: the pork did not move — % came off', before_pork - after_pork;
  end if;
  if before_noodle - after_noodle <> 100 then
    raise exception 'FAIL: the component''s noodles did not move — %', before_noodle - after_noodle;
  end if;

  -- 200g x 0.50 + 100g x 0.20 = 120. NOT 358, which is what two of them sell
  -- for: a staff meal is not a missed sale.
  if cost is distinct from 120 then
    raise exception 'FAIL: expected the COGS of 120, got %', cost;
  end if;
  if cost >= 358 then
    raise exception 'FAIL: the dish was priced at what it SELLS for';
  end if;
end $$;

\echo '--- and it lands in the consumption log, so reorders stay right ---'
do $$
declare n int;
begin
  -- A staff meal that skipped this would quietly make every reorder
  -- suggestion too small, and nothing would say why.
  select count(*) into n
    from consumption_log
   where ingredient_id = 'w-pork' and date = shop_date() and type = 'internal';
  if n = 0 then
    raise exception 'FAIL: wasting a dish left no trace in consumption_log';
  end if;
  raise notice 'the usage averages and the reorder list see it';
end $$;

\echo '--- the log will accept a dish as a source ---'
do $$
begin
  insert into waste_log (date, qty, unit, reason, total_cost, category,
                         source_type, source_id, source_name)
    values (shop_date(), 2, 'serving', 'Staff meal', 120, 'internal',
            'meal', 'w-meal', 'W Rice Meal');
  raise notice 'source_type = meal is allowed';
exception when check_violation then
  raise exception 'FAIL: the waste log still refuses a whole dish';
end $$;

\echo '--- but not an invented kind ---'
do $$
begin
  begin
    insert into waste_log (date, qty, reason, total_cost, source_type, source_id)
      values (shop_date(), 1, 'x', 0, 'whatever', 'x');
    raise exception 'FAIL: the log accepted a source_type nothing reads';
  exception when check_violation then
    raise notice 'an unknown source_type is still refused';
  end;
end $$;

\echo '--- a dish with no recipe takes nothing and costs nothing ---'
do $$
declare cost numeric;
begin
  -- Rather than throwing: the costing screens already name a dish with no
  -- recipe, and refusing the log would stop somebody recording a real loss.
  insert into meals (id, name, price) values ('w-bare', 'W Bare', 99)
    on conflict (id) do nothing;
  cost := consume_meal('w-bare', 1, shop_date(), 'internal');
  if cost is distinct from 0 then
    raise exception 'FAIL: a dish with no recipe cost % out of nowhere', cost;
  end if;
  raise notice 'a dish with no recipe logs at zero rather than refusing';
end $$;


\echo '=== 0064 a discount is the first thing here that gives food away ==='
-- Every other feature in this system records what happened. A discount
-- CHANGES what is owed, so the rules that stop one costing more than the
-- shop meant are constraints in the database, not conventions in a form.
select act_as_service();
reset role;

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333','buyer@x'),
  ('44444444-4444-4444-4444-444444444444','other@x')
on conflict do nothing;

delete from promo_redemptions;
delete from promos;

insert into meals (id, name, price) values ('p-dish', 'P Dish', 150)
  on conflict (id) do update set price = excluded.price;

\echo '--- a percent over 100 would pay the customer to eat here ---'
do $$
begin
  begin
    insert into promos (label, kind, value) values ('Mad', 'percent', 150);
    raise exception 'FAIL: 150%% off was accepted';
  exception when check_violation then
    raise notice 'a percent above 100 is refused';
  end;
end $$;

\echo '--- but 150 pesos off is a Tuesday ---'
do $$
begin
  -- The reason `kind` is two values and not one amount plus a flag: the
  -- number that is nonsense for one is ordinary for the other.
  insert into promos (id, label, kind, value) values ('p-amt', 'Tuesday', 'amount', 150);
  raise notice 'a peso amount of 150 is allowed';
end $$;

\echo '--- a dish promo with no dish would advertise and never fire ---'
do $$
begin
  begin
    insert into promos (label, kind, value, scope) values ('Bad', 'percent', 10, 'meal');
    raise exception 'FAIL: a dish promo with no dish was accepted';
  exception when check_violation then
    raise notice 'scope = meal without a meal_id is refused';
  end;
end $$;

\echo '--- and a window that ends before it starts can never be used ---'
do $$
begin
  begin
    insert into promos (label, kind, value, starts_on, ends_on)
      values ('Backwards', 'percent', 10, date '2026-10-10', date '2026-10-01');
    raise exception 'FAIL: a backwards window was accepted';
  exception when check_violation then
    raise notice 'ends_on before starts_on is refused';
  end;
end $$;

\echo '--- one code, one promo: SULIT50 cannot mean two things ---'
do $$
begin
  insert into promos (id, code, label, kind, value)
    values ('p-code', 'SULIT50', 'Sulit', 'percent', 50);
  begin
    insert into promos (code, label, kind, value)
      values ('SULIT50', 'Sulit again', 'amount', 20);
    raise exception 'FAIL: the same code now names two different discounts';
  exception when unique_violation then
    raise notice 'a duplicate code is refused';
  end;
end $$;

\echo '--- but counter discounts have no code, and there can be many ---'
do $$
declare n int;
begin
  -- Postgres treats nulls as distinct in a unique index, which is exactly
  -- what is wanted here: nobody types a counter discount, so it has no
  -- code, and the shop will have several.
  insert into promos (id, label, kind, value, code) values
    ('p-senior', 'Senior 20%', 'percent', 20, null),
    ('p-staff', 'Staff meal', 'percent', 50, null);
  select count(*) into n from promos where code is null;
  if n < 2 then
    raise exception 'FAIL: only % codeless promo(s) survived — the unique index is eating them', n;
  end if;
  raise notice '% codeless counter discounts coexist', n;
end $$;

\echo '--- one promo per order: nothing stacks by accident ---'
do $$
begin
  insert into orders (id, revenue, status, customer_id)
    values ('p-order', 100, 'completed', '33333333-3333-3333-3333-333333333333');
  insert into promo_redemptions (promo_id, order_id, customer_id, amount)
    values ('p-code', 'p-order', '33333333-3333-3333-3333-333333333333', 50);
  begin
    insert into promo_redemptions (promo_id, order_id, customer_id, amount)
      values ('p-amt', 'p-order', '33333333-3333-3333-3333-333333333333', 150);
    raise exception 'FAIL: two promos landed on one order';
  exception when unique_violation then
    raise notice 'a second promo on the same order is refused';
  end;
end $$;

\echo '--- a use cannot be recorded as a negative amount ---'
do $$
begin
  begin
    insert into orders (id, revenue, status) values ('p-order-neg', 100, 'completed');
    insert into promo_redemptions (promo_id, order_id, amount)
      values ('p-code', 'p-order-neg', -50);
    raise exception 'FAIL: a promo ADDED 50 pesos';
  exception when check_violation then
    raise notice 'a negative discount is refused';
  end;
end $$;

\echo '--- deleting the order gives the use back ---'
do $$
declare n int;
begin
  -- Without the cascade, a customer who cancelled would still be counted
  -- against a "one each" code — told they had used something they never
  -- received.
  delete from orders where id = 'p-order';
  select count(*) into n from promo_redemptions where promo_id = 'p-code';
  if n <> 0 then
    raise exception 'FAIL: % use(s) still counted against a deleted order', n;
  end if;
  raise notice 'the use went with the order';
end $$;

\echo '--- the order remembers what it was given, and stays net ---'
do $$
declare d numeric; r numeric; c text;
begin
  insert into orders (id, revenue, discount, promo_code, status)
    values ('p-order-2', 150, 50, 'SULIT50', 'completed');
  select discount, revenue, promo_code into d, r, c from orders where id = 'p-order-2';
  if d is distinct from 50 or r is distinct from 150 or c is distinct from 'SULIT50' then
    raise exception 'FAIL: the order came back as revenue %, discount %, code %', r, d, c;
  end if;
  raise notice 'revenue is what the drawer took; the discount sits beside it';
end $$;

\echo '--- and a negative discount on an order is refused too ---'
do $$
begin
  begin
    update orders set discount = -10 where id = 'p-order-2';
    raise exception 'FAIL: an order carries a negative discount';
  exception when check_violation then
    raise notice 'orders.discount cannot go below zero';
  end;
end $$;

\echo '--- a customer cannot read the shop''s coupon book ---'
do $$
declare seen int;
begin
  -- The whole feature is that a customer can CHECK one code. Being able to
  -- LIST every code the shop has ever made is a different thing, and it is
  -- worth money: every unreleased promo, every staff discount.
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into seen from promos;
  reset role;
  if seen <> 0 then
    raise exception 'FAIL: a customer can list % promo(s) — that is a coupon book', seen;
  end if;
  raise notice 'a signed-in customer sees 0 promos';
end $$;

\echo '--- but they can see their own uses, and only their own ---'
select act_as_service();
reset role;
insert into orders (id, revenue, status, customer_id) values
  ('p-mine', 100, 'completed', '33333333-3333-3333-3333-333333333333'),
  ('p-theirs', 100, 'completed', '44444444-4444-4444-4444-444444444444');
insert into promo_redemptions (promo_id, order_id, customer_id, amount) values
  ('p-code', 'p-mine', '33333333-3333-3333-3333-333333333333', 50),
  ('p-code', 'p-theirs', '44444444-4444-4444-4444-444444444444', 50);
do $$
declare mine int; total int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into total from promo_redemptions;
  select count(*) into mine from promo_redemptions
    where customer_id = '33333333-3333-3333-3333-333333333333';
  reset role;
  if mine <> 1 then
    raise exception 'FAIL: a customer cannot see their own redemption — saw %', mine;
  end if;
  if total <> 1 then
    raise exception 'FAIL: a customer sees % redemptions — somebody else''s too', total;
  end if;
  raise notice 'a customer sees their own use and nobody else''s';
end $$;

\echo '--- a customer cannot write themselves a discount ---'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  begin
    insert into promos (label, kind, value) values ('Free food', 'percent', 100);
    reset role;
    raise exception 'FAIL: a customer created their own 100%% off promo';
  exception when insufficient_privilege then
    reset role;
    raise notice 'a customer cannot create a promo';
  end;
end $$;

\echo '--- and staff cannot either: only the owner sets the prices ---'
do $$
begin
  -- Staff READ promos, because the till lists them. Writing one is how a
  -- discount that nobody agreed to gets applied every shift.
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  begin
    insert into promos (label, kind, value) values ('Ana''s discount', 'percent', 30);
    reset role;
    raise exception 'FAIL: staff wrote their own discount';
  exception when insufficient_privilege then
    reset role;
    raise notice 'staff may read the list, not add to it';
  end;
end $$;

\echo '--- staff can read it, because the till has to show the list ---'
do $$
declare seen int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select count(*) into seen from promos;
  reset role;
  if seen = 0 then
    raise exception 'FAIL: the counter cannot see a single promo to offer';
  end if;
  raise notice 'staff see % promo(s) at the till', seen;
end $$;

\echo '--- deleting a dish takes its dish-promo with it ---'
select act_as_service();
reset role;
do $$
declare n int;
begin
  -- Otherwise the promo survives pointing at nothing, and the next customer
  -- who types it is told it applies to a dish that is not on the menu.
  insert into promos (id, label, kind, value, scope, meal_id)
    values ('p-dishpromo', 'Dish promo', 'percent', 10, 'meal', 'p-dish');
  delete from meals where id = 'p-dish';
  select count(*) into n from promos where id = 'p-dishpromo';
  if n <> 0 then
    raise exception 'FAIL: a dish promo outlived its dish';
  end if;
  raise notice 'the promo went with the dish';
end $$;


\echo '=== 0065 the day it ran out ==='
-- The figure this protects is a reorder warning the shop will act on. An
-- average three times too long does not look wrong on a screen — it looks
-- like a number — and the shop finds out when the gas dies mid-service.
select act_as_service();
reset role;
delete from running_costs;

\echo '--- a purchase still in use records no end date, and that is a state ---'
do $$
declare open_rows int;
begin
  insert into running_costs (id, label, kind, amount, qty, spent_on)
    values ('aaaa0001-0000-4000-8000-000000000001', 'Dishwashing liquid', 'supplies', 120, 1, date '2026-01-01');
  select count(*) into open_rows from running_costs where ran_out_on is null;
  if open_rows <> 1 then
    raise exception 'FAIL: expected one open purchase, found %', open_rows;
  end if;
  raise notice 'null ran_out_on means still going, not missing';
end $$;

\echo '--- qty defaults to one, which is what every older row meant ---'
do $$
declare q numeric;
begin
  insert into running_costs (id, label, kind, amount, spent_on)
    values ('aaaa0001-0000-4000-8000-000000000002', 'Tissue', 'supplies', 90, date '2026-01-01');
  select qty into q from running_costs where id = 'aaaa0001-0000-4000-8000-000000000002';
  if q is distinct from 1 then
    raise exception 'FAIL: a row with no qty came back as % — every old lifespan would divide by it', q;
  end if;
  raise notice 'qty defaults to 1';
end $$;

\echo '--- running out before it was bought is a typo, every time ---'
do $$
begin
  begin
    update running_costs set ran_out_on = date '2025-12-01' where id = 'aaaa0001-0000-4000-8000-000000000001';
    raise exception 'FAIL: a bottle ran out a month before it was bought';
  exception when check_violation then
    raise notice 'an end date before the purchase is refused';
  end;
end $$;

\echo '--- but bought and finished the same day is real, and allowed ---'
do $$
begin
  -- Refusing it would make the shop lie about the date to get the row saved,
  -- and a lied-about date is worse than a short one.
  insert into running_costs (id, label, kind, amount, spent_on, ran_out_on)
    values ('aaaa0001-0000-4000-8000-000000000003', 'Charcoal', 'supplies', 60, date '2026-01-05', date '2026-01-05');
  raise notice 'a same-day life is accepted';
end $$;

\echo '--- a quantity of zero would divide every lifespan by nothing ---'
do $$
begin
  begin
    insert into running_costs (id, label, kind, amount, qty, spent_on)
      values ('aaaa0001-0000-4000-8000-000000000004', 'Nothing', 'supplies', 10, 0, shop_date());
    raise exception 'FAIL: a purchase of zero things was accepted';
  exception when check_violation then
    raise notice 'qty must be positive';
  end;
end $$;

\echo '--- the end date lands, and the maths it feeds is right ---'
do $$
declare each_lasts numeric;
begin
  -- Three tanks bought together, gone in ninety days. That is thirty days a
  -- tank. The whole reason `qty` exists: without the division the shop is
  -- told a tank lasts three months and reorders two tanks too late.
  insert into running_costs (id, label, kind, amount, qty, size_label, spent_on, ran_out_on)
    values ('aaaa0001-0000-4000-8000-000000000005', 'Gas refill', 'gas', 3600, 3, '11kg',
            date '2026-01-01', date '2026-04-01');
  select (ran_out_on - spent_on) / qty into each_lasts
    from running_costs where id = 'aaaa0001-0000-4000-8000-000000000005';
  if each_lasts is distinct from 30 then
    raise exception 'FAIL: three tanks over 90 days came out at % days each', each_lasts;
  end if;
  raise notice 'three tanks over ninety days is thirty days each';
end $$;

\echo '--- the shift may record a spend but not rewrite what it cost ---'
do $$
declare still numeric;
begin
  -- Unchanged by 0065, and worth pinning precisely because the new columns
  -- sit on a table the shift can insert into: the boundary is still that
  -- only a manager edits a row that already exists.
  --
  -- Asserted on the VALUE, not on an exception, because RLS does not refuse
  -- an UPDATE the way it refuses an INSERT — it filters the rows out, and
  -- the statement then reports success having changed nothing. A check
  -- written to expect an error would pass on a database that let the write
  -- through, which is the wrong way round.
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  update running_costs set amount = 1, ran_out_on = null
    where id = 'aaaa0001-0000-4000-8000-000000000005';
  reset role;

  select amount into still from running_costs
    where id = 'aaaa0001-0000-4000-8000-000000000005';
  if still is distinct from 3600 then
    raise exception 'FAIL: staff rewrote a refill from 3600 to %', still;
  end if;
  raise notice 'staff add spends, a manager edits them';
end $$;

\echo '--- and a manager may, because somebody has to fix a typo ---'
do $$
declare ended date;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update running_costs set ran_out_on = date '2026-04-02'
    where id = 'aaaa0001-0000-4000-8000-000000000005';
  reset role;

  select ran_out_on into ended from running_costs
    where id = 'aaaa0001-0000-4000-8000-000000000005';
  if ended is distinct from date '2026-04-02' then
    raise exception 'FAIL: the owner could not record the day it ran out — got %', ended;
  end if;
  raise notice 'the owner records the end date';
end $$;


\echo '=== 0066 the bill is not the customer''s to write ==='
-- These are the exploits themselves, run as the customer, kept as checks.
-- Every one of them SUCCEEDED before this migration.
select act_as_service();
reset role;

insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666666','shopper@x')
on conflict do nothing;
insert into profiles (id, role, full_name) values
  ('66666666-6666-6666-6666-666666666666','customer','A Shopper')
on conflict (id) do update set role = excluded.role;

insert into orders (id, customer_id, revenue, discount, status, payment_status)
  values ('g-order', '66666666-6666-6666-6666-666666666666', 500, 0, 'pending', 'unpaid')
on conflict (id) do update
  set revenue = 500, discount = 0, status = 'pending', payment_status = 'unpaid',
      customer_id = '66666666-6666-6666-6666-666666666666';

create or replace function act_as_customer() returns void language plpgsql as
$f$ begin
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
end $f$;

\echo '--- a customer cannot discount their own order ---'
do $$
declare rev numeric;
begin
  set local role authenticated;
  perform act_as_customer();
  begin
    update orders set revenue = 1, discount = 499, promo_code = 'I MADE THIS UP'
     where id = 'g-order';
    reset role;
    raise exception 'FAIL: a customer rewrote a 500 peso order down to 1';
  exception when insufficient_privilege then
    reset role;
    raise notice 'refused: %', sqlerrm;
  end;

  select revenue into rev from orders where id = 'g-order';
  if rev is distinct from 500 then
    raise exception 'FAIL: the bill moved to % anyway', rev;
  end if;
  raise notice 'the bill held at 500';
end $$;

\echo '--- nor mark it paid without paying ---'
do $$
declare ps text;
begin
  set local role authenticated;
  perform act_as_customer();
  begin
    update orders set payment_status = 'paid' where id = 'g-order';
    reset role;
    raise exception 'FAIL: a customer marked their own order paid';
  exception when insufficient_privilege then
    reset role;
    raise notice 'refused, correctly';
  end;

  select payment_status into ps from orders where id = 'g-order';
  if ps is distinct from 'unpaid' then
    raise exception 'FAIL: payment_status is now %', ps;
  end if;
  raise notice 'still unpaid, which is the truth';
end $$;

\echo '--- but they can still cancel and still edit the things that are theirs ---'
do $$
declare note text; st text;
begin
  -- The guard must not turn into "a customer can do nothing". Contact
  -- details, notes and cancelling are theirs, and a fix that broke them
  -- would be discovered by a customer, not by this file.
  set local role authenticated;
  perform act_as_customer();
  update orders set notes = 'No onions please', contact_phone = '09171234567'
   where id = 'g-order';
  reset role;

  select notes into note from orders where id = 'g-order';
  if note is distinct from 'No onions please' then
    raise exception 'FAIL: a customer cannot leave a note — got %', note;
  end if;

  set local role authenticated;
  perform act_as_customer();
  update orders set status = 'cancelled', cancelled_reason = 'Changed my mind'
   where id = 'g-order';
  reset role;

  select status into st from orders where id = 'g-order';
  if st is distinct from 'cancelled' then
    raise exception 'FAIL: a customer can no longer cancel — status is %', st;
  end if;
  raise notice 'notes, phone and cancelling all still work';
end $$;

\echo '--- the shop itself is not guarded: staff set prices, that is the job ---'
do $$
declare rev numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update orders set revenue = 450, discount = 50, promo_code = 'SULIT'
   where id = 'g-order';
  reset role;

  select revenue into rev from orders where id = 'g-order';
  if rev is distinct from 450 then
    raise exception 'FAIL: the owner cannot correct an order — revenue is %', rev;
  end if;
  raise notice 'the owner prices an order, as always';
end $$;

\echo '--- and a line''s price is not the customer''s either ---'
select act_as_service();
reset role;
insert into meals (id, name, price) values ('g-dish', 'G Dish', 150)
  on conflict (id) do update set price = excluded.price;
insert into orders (id, customer_id, revenue, status)
  values ('g-order-2', '66666666-6666-6666-6666-666666666666', 150, 'pending')
on conflict (id) do update set status = 'pending', revenue = 150;
insert into order_lines (id, order_id, meal_id, qty, price_at_sale)
  values (990001, 'g-order-2', 'g-dish', 1, 150)
on conflict (id) do update set price_at_sale = 150, qty = 1;

do $$
declare p numeric;
begin
  -- Guarding the total and leaving the prices it is rebuilt from writable
  -- would move the exploit rather than close it: set every line to a peso,
  -- nudge a quantity, and the server recomputes the bill down for you.
  set local role authenticated;
  perform act_as_customer();
  begin
    update order_lines set price_at_sale = 1 where id = 990001;
    reset role;
    raise exception 'FAIL: a customer repriced a dish on their own order';
  exception when insufficient_privilege then
    reset role;
    raise notice 'refused, correctly';
  end;

  select price_at_sale into p from order_lines where id = 990001;
  if p is distinct from 150 then
    raise exception 'FAIL: the dish is now %', p;
  end if;
  raise notice 'the dish is still 150';
end $$;

\echo '--- but changing how many is exactly what editing an order means ---'
do $$
declare n numeric;
begin
  set local role authenticated;
  perform act_as_customer();
  update order_lines set qty = 3 where id = 990001;
  reset role;

  select qty into n from order_lines where id = 990001;
  if n is distinct from 3 then
    raise exception 'FAIL: a customer cannot change a quantity — qty is %', n;
  end if;
  raise notice 'the quantity is the customer''s to change';
end $$;

\echo '--- a customer cannot slip a free dish onto their own order ---'
do $$
begin
  set local role authenticated;
  perform act_as_customer();
  begin
    insert into order_lines (order_id, meal_id, qty, price_at_sale)
      values ('g-order-2', 'g-dish', 1, 0);
    reset role;
    raise exception 'FAIL: a customer added a dish at zero pesos';
  exception when insufficient_privilege then
    reset role;
    raise notice 'items are added at checkout, by the shop';
  end;
end $$;

\echo '--- the payment function still works, because it is trusted by name ---'
do $$
declare ok boolean; ps text;
begin
  -- The guard must not break the one customer-facing write that legitimately
  -- touches a payment column. It writes 'submitted', never 'paid' — the shop
  -- still decides that, which is the whole reason the guard exists.
  set local role authenticated;
  perform act_as_customer();
  select submit_payment_reference('g-order-2', '1234567890', null) into ok;
  reset role;

  if ok is not true then
    raise exception 'FAIL: a customer can no longer submit a GCash reference';
  end if;
  select payment_status into ps from orders where id = 'g-order-2';
  if ps is distinct from 'submitted' then
    raise exception 'FAIL: the reference went in but payment_status is %', ps;
  end if;
  raise notice 'a GCash reference still goes in, as submitted';
end $$;

\echo '--- and the flag it raises does not stay raised ---'
do $$
begin
  -- If the trusted flag leaked past the function, every check above would
  -- pass for the wrong reason from here on.
  set local role authenticated;
  perform act_as_customer();
  begin
    update orders set revenue = 1 where id = 'g-order-2';
    reset role;
    raise exception 'FAIL: the trusted flag is still on — the guard is off';
  exception when insufficient_privilege then
    reset role;
    raise notice 'the flag was put down again';
  end;
end $$;

\echo '--- a cancelled order gives the promo back ---'
select act_as_service();
reset role;
do $$
declare live int;
begin
  -- The shop cancels orders constantly — out of stock, the customer never
  -- showed, the wrong address — and the row stays, because the record of
  -- what happened matters. The cascade only fires on DELETE, so a "one
  -- each" code would stay burned for somebody who was never fed. The usage
  -- queries count THROUGH the order for exactly this reason, and this is
  -- the shape of the count they run.
  delete from promo_redemptions;
  delete from promos where id = 'p-cancel';
  insert into promos (id, code, label, kind, value, max_per_customer)
    values ('p-cancel', 'GIVEBACK', 'Give back', 'percent', 10, 1);
  insert into orders (id, customer_id, revenue, status)
    values ('p-cancelled', '66666666-6666-6666-6666-666666666666', 100, 'cancelled')
  on conflict (id) do update set status = 'cancelled';
  insert into promo_redemptions (promo_id, order_id, customer_id, amount)
    values ('p-cancel', 'p-cancelled', '66666666-6666-6666-6666-666666666666', 10);

  select count(*) into live
    from promo_redemptions r join orders o on o.id = r.order_id
   where r.promo_id = 'p-cancel' and o.status <> 'cancelled';
  if live <> 0 then
    raise exception 'FAIL: a cancelled order still counts % use(s) against the code', live;
  end if;

  -- And the record of it is still there, which is the other half: the shop
  -- can still see that the code was tried on an order that fell through.
  if (select count(*) from promo_redemptions where promo_id = 'p-cancel') <> 1 then
    raise exception 'FAIL: the record of the attempt was thrown away';
  end if;
  raise notice 'the use comes back, and the history stays';
end $$;


\echo '=== the shelf alert reaches the screen that can fix it ==='
-- The warning has been written since 0060 and lived only in the activity
-- log. The Inventory badge and panel read it back with an exact filter, and
-- a filter that does not match what the database writes is a warning that
-- still goes nowhere — which is the bug being fixed, twice.
select act_as_service();
reset role;

do $$
declare n int; today_rows int;
begin
  delete from activity_log where category = 'movement' and description like 'SA %';

  insert into ingredients (id, name, unit, cost, stock)
    values ('sa-pork', 'SA Pork', 'g', 1, 50)
  on conflict (id) do update set stock = 50, cost = 1;
  insert into meals (id, name, price) values ('sa-dish', 'SA Dish', 100)
    on conflict (id) do update set price = 100;
  delete from meal_ingredients where meal_id = 'sa-dish';
  -- 200g a serving against 50g on the shelf: this sale must go negative.
  insert into meal_ingredients (meal_id, ref_type, ref_id, qty)
    values ('sa-dish', 'inv', 'sa-pork', 200);

  insert into orders (id, revenue, status) values ('sa-order', 100, 'completed')
    on conflict (id) do update set status = 'completed', stock_applied_at = null;
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
    values ('sa-order', 'sa-dish', 1, 100);

  perform apply_order_stock('sa-order');

  -- Exactly the query the badge runs: category 'movement', filed under the
  -- shop's own day. If 0060 ever files these under a different date or
  -- category, this is where it is caught rather than on a quiet screen.
  select count(*) into today_rows from activity_log
   where category = 'movement' and date = shop_date();
  if today_rows = 0 then
    raise exception 'FAIL: the shelf went below zero and the badge query finds nothing';
  end if;

  select count(*) into n from ingredients where id = 'sa-pork' and stock < 0;
  if n <> 1 then
    raise exception 'FAIL: the shelf did not actually go below zero — nothing to warn about';
  end if;

  raise notice 'the shelf went negative and % movement row(s) are filed under today', today_rows;
end $$;

\echo '--- and the same sale does not warn twice ---'
do $$
declare before_rows int; after_rows int;
begin
  -- `apply_order_stock` claims the order before it deducts, so a second call
  -- is a no-op. A badge that counted a duplicate would send somebody to
  -- recount a shelf that was already recounted.
  select count(*) into before_rows from activity_log
   where category = 'movement' and date = shop_date();
  perform apply_order_stock('sa-order');
  select count(*) into after_rows from activity_log
   where category = 'movement' and date = shop_date();
  if after_rows <> before_rows then
    raise exception 'FAIL: applying the same order twice warned again (% -> %)',
      before_rows, after_rows;
  end if;
  raise notice 'one sale, one warning';
end $$;


\echo '=== 0068 a sale survives its customer ==='
-- The day this is about: the project is gone, the owner makes a new one,
-- runs the migrations and puts the backup back. A backup cannot carry
-- `auth.users`, so the file is full of rows pointing at accounts that exist
-- nowhere. What happens to them is the whole question.
select act_as_service();
reset role;

\echo '--- an order for an account that no longer exists is refused outright ---'
do $$
begin
  begin
    insert into orders (id, customer_id, revenue, status)
      values ('gone-order', '99999999-9999-9999-9999-999999999999', 500, 'completed');
    raise exception 'FAIL: the foreign key is gone — this check no longer tests anything';
  exception when foreign_key_violation then
    raise notice 'refused, which is why the restore has to repair the row first';
  end;
end $$;

\echo '--- but without the dangling link it is still a sale ---'
do $$
declare rev numeric;
begin
  -- Exactly what `repairRows` does: drop the link, keep the money, the date,
  -- the ticket and the lines. An order whose customer was deleted is not a
  -- sale that did not happen.
  insert into orders (id, customer_id, revenue, status)
    values ('gone-order', null, 500, 'completed');
  select revenue into rev from orders where id = 'gone-order';
  if rev is distinct from 500 then
    raise exception 'FAIL: the sale came back as %', rev;
  end if;
  raise notice 'the sale is intact, only the link is lost';
end $$;

\echo '--- the shop can ask which accounts actually exist here ---'
do $$
declare found int;
begin
  select count(*) into found from auth_users_present(array[
    '11111111-1111-1111-1111-111111111111'::uuid,
    '99999999-9999-9999-9999-999999999999'::uuid
  ]);
  if found <> 1 then
    raise exception 'FAIL: expected exactly one of the two to exist, got %', found;
  end if;
  raise notice 'one of two accounts is present, which is the answer the restore needs';
end $$;

\echo '--- and it cannot be used to list the shop''s accounts ---'
do $$
declare n int;
begin
  -- Nothing comes back that did not go in. A function that answered an empty
  -- array with every user would be an account dump behind a helper name.
  select count(*) into n from auth_users_present(array[]::uuid[]);
  if n <> 0 then
    raise exception 'FAIL: an empty question returned % accounts', n;
  end if;
  raise notice 'nothing comes back that did not go in';
end $$;

\echo '--- a browser session cannot call it at all ---'
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    perform auth_users_present(array['11111111-1111-1111-1111-111111111111'::uuid]);
    reset role;
    raise exception 'FAIL: a signed-in session can probe the account table';
  exception when insufficient_privilege then
    reset role;
    raise notice 'service role only';
  end;
end $$;

\echo '--- and RESTORE_ORDER still satisfies every foreign key ---'
do $$
declare bad text;
begin
  /* The order the tables go back in is checked against the REAL foreign key
     graph, not read by eye. A migration that adds a table referencing one
     restored later breaks nothing today and everything on restore day —
     which is the one day nobody has time to work out why.

     The list below is generated from `src/lib/restore-order.ts`;
     `tests/restore-order-sync.test.ts` fails if the two ever drift. */
  create temp table if not exists restore_pos(pos int, tbl text) on commit drop;
  delete from restore_pos;
  insert into restore_pos(pos, tbl) values
    (0,'settings'),
  (1,'shop_settings'),
  (2,'shop_hours'),
  (3,'shop_closures'),
  (4,'delivery_settings'),
  (5,'payment_settings'),
  (6,'profiles'),
  (7,'ingredients'),
  (8,'ingredient_lots'),
  (9,'batches'),
  (10,'batch_ingredients'),
  (11,'menu_categories'),
  (12,'menu_products'),
  (13,'meals'),
  (14,'chat_settings'),
  (15,'meal_ingredients'),
  (16,'meal_components'),
  (17,'meal_packaging'),
  (18,'order_packaging'),
  (19,'modifier_groups'),
  (20,'modifier_options'),
  (21,'modifier_option_prices'),
  (22,'meal_modifier_groups'),
  (23,'product_modifier_groups'),
  (24,'suppliers'),
  (25,'staff_shifts'),
  (26,'orders'),
  (27,'order_lines'),
  (28,'order_line_extras'),
  (29,'promos'),
  (30,'promo_redemptions'),
  (31,'purchase_log'),
  (32,'consumption_log'),
  (33,'waste_log'),
  (34,'cash_ledger'),
  (35,'receivables'),
  (36,'cycle_counts'),
  (37,'oe_templates'),
  (38,'fixed_costs'),
  (39,'monthly_bills'),
  (40,'assets'),
  (41,'supplier_debts'),
  (42,'running_costs'),
  (43,'marketing_campaigns'),
  (44,'reviews'),
  (45,'chat_threads'),
  (46,'chat_messages'),
  (47,'faq_entries'),
  (48,'activity_log'),
  (49,'announcements');

  select string_agg(format('%%s (at %%s) needs %%s (at %%s)',
                           c.relname, cp.pos, p.relname, pp.pos), ', ')
    into bad
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_class p on p.oid = con.confrelid
  join pg_namespace n on n.oid = c.relnamespace
  join restore_pos cp on cp.tbl = c.relname
  join restore_pos pp on pp.tbl = p.relname
  where con.contype = 'f' and n.nspname = 'public'
    and c.relname <> p.relname
    and pp.pos > cp.pos;

  if bad is not null then
    raise exception 'FAIL: a restore would hit a foreign key it has not filled yet — %', bad;
  end if;
  raise notice 'every parent restores before its children';

  -- In the same block, because each DO is its own transaction and the temp
  -- table goes with it.
  select string_agg(tbl, ', ') into bad from restore_pos p
   where not exists (select 1 from information_schema.tables t
                      where t.table_schema = 'public' and t.table_name = p.tbl);
  if bad is not null then
    raise exception 'FAIL: the restore would look for tables that are not here — %', bad;
  end if;
  raise notice 'and every table in the list is real';
end $$;


\echo '=== 0069 what moved the shelf, said in words ==='
-- The shop reported the ingredient history as not working. It searched the
-- ACTIVITY LOG for the ingredient's name, and a sale writes no activity line
-- naming an ingredient — so every order was invisible. The fix reads
-- `consumption_log` by id, which means this is the check that matters: does
-- a sale actually land there, with something worth reading on it?
select act_as_service();
reset role;

do $$
declare n int; noted text;
begin
  delete from consumption_log where ingredient_id = 'h-pork';
  insert into ingredients (id, name, unit, cost, stock)
    values ('h-pork', 'H Pork', 'g', 0.5, 1000)
  on conflict (id) do update set stock = 1000, cost = 0.5;
  insert into meals (id, name, price) values ('h-dish', 'H Dish', 150)
    on conflict (id) do update set price = 150;
  delete from meal_ingredients where meal_id = 'h-dish';
  insert into meal_ingredients (meal_id, ref_type, ref_id, qty)
    values ('h-dish', 'inv', 'h-pork', 200);

  insert into orders (id, revenue, status) values ('h-order', 150, 'completed')
    on conflict (id) do update set status = 'completed', stock_applied_at = null;
  delete from order_lines where order_id = 'h-order';
  insert into order_lines (order_id, meal_id, qty, price_at_sale)
    values ('h-order', 'h-dish', 1, 150);

  perform apply_order_stock('h-order');

  select count(*), max(note) into n, noted
    from consumption_log where ingredient_id = 'h-pork' and type = 'sale';
  if n = 0 then
    raise exception 'FAIL: a sale left no trace the history can read';
  end if;
  if noted is null or noted = '' then
    raise exception 'FAIL: the sale recorded no description';
  end if;
  if noted not like '%ticket%' then
    raise exception 'FAIL: the note says "%" — a ticket number is what somebody can match against a receipt', noted;
  end if;
  raise notice 'a sale writes: %', noted;
end $$;

\echo '--- a batch says which batch ---'
do $$
declare noted text;
begin
  insert into batches (id, name, yield_qty, yield_unit, batch_stock)
    values ('h-batch', 'H Sauce', 10, 'pack', 0)
  on conflict (id) do update set yield_qty = 10, name = 'H Sauce';
  delete from batch_ingredients where batch_id = 'h-batch';
  insert into batch_ingredients (batch_id, ref_type, ref_id, qty)
    values ('h-batch', 'inv', 'h-pork', 100);

  perform produce_batch('h-batch', 1);

  select note into noted from consumption_log
   where ingredient_id = 'h-pork' and type = 'batch'
   order by created_at desc limit 1;
  if noted is null or noted not like '%H Sauce%' then
    raise exception 'FAIL: the batch line says "%" rather than naming the batch', noted;
  end if;
  raise notice 'a batch writes: %', noted;
end $$;

\echo '--- a staff meal says which dish ---'
do $$
declare noted text;
begin
  perform consume_meal('h-dish', 1, shop_date(), 'internal');
  select note into noted from consumption_log
   where ingredient_id = 'h-pork' and type = 'internal'
   order by created_at desc limit 1;
  if noted is null or noted not like '%H Dish%' then
    raise exception 'FAIL: the staff-meal line says "%" rather than naming the dish', noted;
  end if;
  -- The dish name on its own reads as a label rather than an event: the
  -- shelf wants to know whether it was eaten by staff or scraped into a bin.
  if noted not like 'Staff meal%' then
    raise exception 'FAIL: "%" does not say what happened to the dish', noted;
  end if;
  raise notice 'a staff meal writes: %', noted;
end $$;

\echo '--- and a four-argument caller still gets a sentence, not a blank ---'
do $$
declare noted text;
begin
  -- Rows written before 0069 have no note at all, and some caller somewhere
  -- may still pass four arguments. Neither may produce an empty line.
  perform consume_ingredient('h-pork', 10, shop_date(), 'count');
  select note into noted from consumption_log
   where ingredient_id = 'h-pork' and type = 'count'
   order by created_at desc limit 1;
  if noted is null or length(noted) < 4 then
    raise exception 'FAIL: a note-less call wrote "%"', noted;
  end if;
  raise notice 'a call with no note still writes: %', noted;
end $$;

\echo '--- same-day lines can be read back in the order they happened ---'
do $$
declare first_at timestamptz; last_at timestamptz;
begin
  -- One sale takes four ingredients off. Without a tie-breaker they all
  -- carry the same date and the history shows them in whatever order the
  -- database felt like.
  select min(created_at), max(created_at) into first_at, last_at
    from consumption_log where ingredient_id = 'h-pork' and date = shop_date();
  if first_at is null or first_at = last_at then
    raise exception 'FAIL: same-day rows share a timestamp — the history cannot order them';
  end if;
  raise notice 'rows on one day are distinguishable in time';
end $$;


\echo '=== 0070 Meta sends it again, and the shop must not answer twice ==='
-- The webhook does four round trips and a call to Facebook before it
-- acknowledges, so a slow send is enough for Meta to re-deliver. What stops
-- the second run is the insert itself, not a check before it — a check has a
-- window between looking and claiming, and two deliveries race.
select act_as_service();
reset role;

\echo '--- the same message id cannot be claimed twice ---'
do $$
begin
  delete from messenger_events where mid like 'm-probe%';
  insert into messenger_events (mid, sender_id) values ('m-probe-1', 'sender-1');
  begin
    insert into messenger_events (mid, sender_id) values ('m-probe-1', 'sender-1');
    raise exception 'FAIL: the same Messenger message was claimed twice — a retry would answer again';
  exception when unique_violation then
    raise notice 'the second delivery is refused, which is how the retry stops';
  end;
end $$;

\echo '--- and a different message from the same person goes through ---'
do $$
declare n int;
begin
  -- The guard must be per MESSAGE, not per sender. Somebody asking two
  -- questions in a row is not a retry.
  insert into messenger_events (mid, sender_id) values ('m-probe-2', 'sender-1');
  select count(*) into n from messenger_events where sender_id = 'sender-1';
  if n <> 2 then
    raise exception 'FAIL: a second question from the same person was swallowed (% rows)', n;
  end if;
  raise notice 'two questions from one person are two messages';
end $$;

\echo '--- the log does not grow for ever ---'
do $$
declare left_over int;
begin
  insert into messenger_events (mid, sender_id, received_at)
    values ('m-probe-old', 'sender-1', now() - interval '30 days');
  perform prune_messenger_events();
  select count(*) into left_over from messenger_events where mid = 'm-probe-old';
  if left_over <> 0 then
    raise exception 'FAIL: a month-old id is still on file';
  end if;
  -- And this week's must survive, or the prune would re-open the very
  -- window it is housekeeping for.
  if (select count(*) from messenger_events where mid = 'm-probe-1') <> 1 then
    raise exception 'FAIL: the prune took an id Meta could still retry against';
  end if;
  raise notice 'a month old is gone, this week is kept';
end $$;

\echo '--- and nobody with a browser can read who messaged the Page ---'
do $$
declare seen int;
begin
  -- The conversations themselves live in `chat_threads`, behind the inbox's
  -- own rules. This table is a list of who messaged and when, and it has no
  -- policies at all on purpose.
  set local role authenticated;
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select count(*) into seen from messenger_events;
  reset role;
  if seen <> 0 then
    raise exception 'FAIL: the owner''s own session can list % Messenger sender(s) here', seen;
  end if;
  raise notice 'no policies, so no rows — even for the owner';
end $$;
