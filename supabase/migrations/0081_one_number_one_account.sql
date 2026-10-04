/*
 * One mobile number, one account.
 *
 * Nothing stopped the same number being used to sign up twice. That matters
 * more here than it looks:
 *
 *   The number is how the shop reaches somebody about their order. Two
 *   accounts on one number means a rider ringing about an order that belongs
 *   to the other one.
 *
 *   It is also the gate on being OFFERED a job — `setStaffRole` refuses to
 *   offer without a phone number, because the number is how the owner knows
 *   who they are promoting. Two accounts sharing a number makes that check
 *   answer about the wrong person.
 *
 *   And the shop runs promos per customer. One person with three accounts is
 *   three first-order discounts.
 *
 * ── Why it is normalised first ───────────────────────────────────────────
 *
 * "0917 123 4567", "09171234567" and "+63 917 123 4567" are one number and
 * three strings. A plain unique index on the text would let somebody sign up
 * three times by typing the spaces differently, which is a rule that stops
 * only the honest.
 *
 * `normalise_phone` reduces all of them to the local 11-digit form. It is
 * deliberately conservative: anything it does not recognise as a Philippine
 * mobile is returned digits-only rather than rejected, because this is an
 * index and not a validator — refusing a number at the database would lock
 * out a customer over a format nobody anticipated.
 */

create or replace function normalise_phone(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p is null then null
    -- Everything that is not a digit goes: spaces, dashes, brackets, the +.
    when nullif(regexp_replace(p, '[^0-9]', '', 'g'), '') is null then null
    -- +63 917… and 63 917… are 0917…
    when regexp_replace(p, '[^0-9]', '', 'g') ~ '^639[0-9]{9}$'
      then '0' || substr(regexp_replace(p, '[^0-9]', '', 'g'), 3)
    -- 9171234567, as typed when the leading zero is assumed.
    when regexp_replace(p, '[^0-9]', '', 'g') ~ '^9[0-9]{9}$'
      then '0' || regexp_replace(p, '[^0-9]', '', 'g')
    else regexp_replace(p, '[^0-9]', '', 'g')
  end
$$;

comment on function normalise_phone is
  'One mobile number, one string. 0917…, +63917… and 63917… all reduce to '
  'the local 11-digit form so the unique index below cannot be walked past '
  'by typing the spaces differently.';

-- ------------------------------------------------------------
-- Anything already doubled up is named, not guessed at
--
-- The index below would simply fail on existing duplicates, with a message
-- naming an index and not a customer. Two real accounts on one number is not
-- something a migration may resolve on its own — picking a winner would
-- orphan somebody's order history — so this says exactly which numbers
-- clash and leaves the choice with the shop.
-- ------------------------------------------------------------

do $$
declare
  v_clashes text;
begin
  select string_agg(x.num || ' (' || x.n || ' accounts)', '; ')
    into v_clashes
    from (
      select normalise_phone(phone) as num, count(*) as n
        from profiles
       where nullif(btrim(coalesce(phone, '')), '') is not null
       group by normalise_phone(phone)
      having count(*) > 1
    ) x;

  if v_clashes is not null then
    raise exception
      'FAIL: these numbers are already on more than one account — %. Decide which account keeps each number and clear the phone field on the others in Supabase (Table editor > profiles), then run this migration again. Nothing is deleted by doing that; the orders stay with their accounts.',
      v_clashes;
  end if;
end $$;

-- ------------------------------------------------------------
-- The rule
--
-- Partial, because a blank is not a duplicate: plenty of accounts have no
-- number at all and must stay that way. A unique index over nulls would be
-- fine in Postgres, but over EMPTY STRINGS would not — and the signup form
-- has been writing '' for a missing number since the first migration.
-- ------------------------------------------------------------

create unique index if not exists profiles_one_account_per_phone
  on profiles (normalise_phone(phone))
  where nullif(btrim(coalesce(phone, '')), '') is not null;

-- ------------------------------------------------------------
-- And the number is stored the way it was matched
--
-- Without this the index would quietly hold a different value from the
-- column: the shop would see "0917 123 4567" on screen while the rule
-- compared "09171234567". Storing the normalised form keeps what is
-- displayed, what is searched and what is enforced the same string.
-- ------------------------------------------------------------

create or replace function tidy_profile_phone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.phone := nullif(normalise_phone(new.phone), '');
  return new;
end $$;

drop trigger if exists tidy_profile_phone on profiles;
create trigger tidy_profile_phone
  before insert or update of phone on profiles
  for each row execute function tidy_profile_phone();

-- ---------------------------------------------------------------
-- Behaviour checks
-- ---------------------------------------------------------------

do $$
begin
  /* The three spellings are one number. */
  if normalise_phone('0917 123 4567') <> '09171234567' then
    raise exception 'FAIL: spaces are not stripped from a number';
  end if;
  if normalise_phone('+63 917 123 4567') <> '09171234567' then
    raise exception 'FAIL: +63 is not reduced to the local form';
  end if;
  if normalise_phone('639171234567') <> '09171234567' then
    raise exception 'FAIL: 63 without the plus is not reduced';
  end if;
  if normalise_phone('9171234567') <> '09171234567' then
    raise exception 'FAIL: a missing leading zero is not restored';
  end if;
  if normalise_phone('0917-123-4567') <> '09171234567' then
    raise exception 'FAIL: dashes are not stripped';
  end if;

  /* Nothing is rejected: this is an index, not a validator. A number it
     does not recognise comes back digits-only rather than null, or an
     unusual format would lock a real customer out of signing up. */
  if normalise_phone('02 8123 4567') is null then
    raise exception 'FAIL: a landline was thrown away instead of kept as digits';
  end if;
  if normalise_phone(null) is not null then
    raise exception 'FAIL: null is not a phone number';
  end if;
  if normalise_phone('   ') is not null then
    raise exception 'FAIL: blank space became a phone number';
  end if;

  raise notice 'OK: one number has one spelling, and nothing is refused';
end $$;

do $$
declare
  v_a uuid := 'dddd1111-1111-1111-1111-dddddddddddd';
  v_b uuid := 'dddd2222-2222-2222-2222-dddddddddddd';
  v_c uuid := 'dddd3333-3333-3333-3333-dddddddddddd';
  v_stored text;
begin
  perform set_config('request.jwt.claim.sub', '', true);

  /* `handle_new_user` already creates a profile for every auth user, so
     these are upserts rather than inserts — the first draft fought that
     trigger and failed on the primary key. */
  insert into auth.users (id, email) values
    (v_a, 'zz-phone-a@x'), (v_b, 'zz-phone-b@x'), (v_c, 'zz-phone-c@x')
  on conflict do nothing;

  insert into profiles (id, role, full_name, phone)
  values (v_a, 'customer', 'ZZ Phone A', '0917 123 4567')
  on conflict (id) do update set phone = excluded.phone, full_name = excluded.full_name;

  /* Stored the way it is matched, or the screen and the rule would compare
     two different strings. */
  select phone into v_stored from profiles where id = v_a;
  if v_stored <> '09171234567' then
    raise exception 'FAIL: the number was stored as "%" rather than normalised', v_stored;
  end if;

  /* The same number, typed differently, is refused. */
  begin
    insert into profiles (id, role, full_name, phone)
    values (v_b, 'customer', 'ZZ Phone B', '+63 917 123 4567')
    on conflict (id) do update set phone = excluded.phone;
    raise exception 'FAIL-DUP';
  exception
    when unique_violation then null;
    when others then
      if sqlerrm = 'FAIL-DUP' then
        raise exception 'FAIL: one number signed up twice by typing the spaces differently';
      end if;
      raise;
  end;

  /* Two accounts with no number at all are fine — most accounts have none,
     and a rule that refuses the second blank would stop signups dead. */
  insert into profiles (id, role, full_name, phone)
  values (v_b, 'customer', 'ZZ Phone B', '')
  on conflict (id) do update set phone = excluded.phone;
  insert into profiles (id, role, full_name, phone)
  values (v_c, 'customer', 'ZZ Phone C', null)
  on conflict (id) do update set phone = excluded.phone;

  delete from profiles where id in (v_a, v_b, v_c);
  delete from auth.users where id in (v_a, v_b, v_c);
  raise notice 'OK: one number one account, and a blank is not a duplicate';
end $$;
