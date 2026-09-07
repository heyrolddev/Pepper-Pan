-- Pepper Pan — a face on the account, and reviews that arrived by Messenger
-- Run this once in the Supabase SQL Editor, after 0038.
--
-- Three things the shop asked for, and one bug found while wiring them.
--
-- 1. A photo per account (`profiles.avatar_url`). The file itself lives in
--    the public PepperPan bucket under `avatars/` — a profile picture is
--    meant to be looked at, so a public bucket is the right home for it, in
--    exact contrast to the backups, which must never go there.
--
-- 2. That photo on the review cards, so a review reads as a person.
--
-- 3. Reviews the shop was sent on Messenger, typed in by the owner. These
--    cannot pretend to be reviews a customer posted here, so they carry
--    `source = 'relayed'` and are labelled as such wherever they appear.
--
-- THE BUG. `profiles_select_own` is `id = auth.uid() or is_staff()`. The
-- public reviews page resolved author names by reading `profiles` with the
-- visitor's own session — which returns nothing at all for a visitor who is
-- not signed in. Every review on the public page has therefore been showing
-- as "A customer". Adding an avatar to that same join would have shown
-- nothing for the same reason, so the fix is part of this migration: a narrow
-- `review_authors` view exposing the first name and photo of people who have
-- actually published a review, and nothing else about them.

-- ============================================================
-- 1. The photo on the account
-- ============================================================
alter table profiles add column if not exists avatar_url text;

comment on column profiles.avatar_url is
  'Public URL of this account''s profile picture in the PepperPan bucket, or null. Written by the account owner; shown on their reviews.';

-- profiles carries whole-table grants (no column-level revoke was ever done
-- on it), so this column is readable and writable by the existing grants
-- without a re-grant. Unlike orders and waste_log — see 0036 — where a new
-- column is invisible until regrant_visible_columns() runs.

-- ============================================================
-- 2. Who wrote a public review
--
-- Deliberately narrow. It exposes three fields, and only for people who have
-- a published review — which is what publishing a review already means. It
-- is not a list of the shop's customers: no phone, no address, no email, and
-- nobody who has not chosen to say something in public.
--
-- security_invoker stays off (the default), so the view reads profiles as its
-- owner rather than as the visitor. That is the whole point: the visitor
-- cannot read profiles, and must not be able to.
-- ============================================================
drop view if exists review_authors;
create view review_authors as
  select p.id, p.full_name, p.avatar_url
  from profiles p
  where exists (
    select 1 from reviews r
    where r.customer_id = p.id and not r.is_hidden
  );

grant select on review_authors to anon, authenticated;

comment on view review_authors is
  'First name and photo of anyone with a published review, for the review cards. The only route by which a signed-out visitor learns anything about an account, and it carries nothing but what that person put in public.';

-- ============================================================
-- 3. A review the shop was sent, rather than one a customer posted
--
-- customer_id becomes nullable: a Messenger review has no account behind it.
-- The name is then stored on the row itself, because there is no profile to
-- read it from.
--
-- `source` is not decoration. A review typed in by the shop is a different
-- kind of thing from one a customer posted from their own signed-in session,
-- and the card says which it is. Presenting the first as the second would be
-- a small lie told on every page it appears on.
-- ============================================================
alter table reviews add column if not exists author_name text;
alter table reviews add column if not exists source text not null default 'customer';
-- `on delete set null`, not the default. If a member of staff ever leaves and
-- their account is removed, the reviews they typed in must stay on the page —
-- they are customers' words, not that person's. Without this the delete is
-- refused outright and removing an old account becomes impossible.
alter table reviews add column if not exists relayed_by uuid
  references auth.users(id) on delete set null;
alter table reviews alter column customer_id drop not null;

alter table reviews drop constraint if exists reviews_source_check;
alter table reviews add constraint reviews_source_check
  check (source in ('customer', 'relayed'));

-- The shape of each kind, held by the database rather than by whoever writes
-- the next insert: a customer review has an account and no typed-in name; a
-- relayed one has a name and no account.
alter table reviews drop constraint if exists reviews_author_shape;
alter table reviews add constraint reviews_author_shape check (
  (source = 'customer' and customer_id is not null)
  or (
    source = 'relayed'
    and customer_id is null
    and author_name is not null
    and length(btrim(author_name)) > 0
  )
);

comment on column reviews.source is
  '''customer'' = posted here by the account in customer_id. ''relayed'' = sent to the shop on Messenger and typed in by the owner, with the name in author_name.';
comment on column reviews.author_name is
  'The customer''s name as the shop typed it, for a relayed review only. A customer review takes its name from the account.';
comment on column reviews.relayed_by is
  'Which staff account typed a relayed review in. So a name in public can always be traced back to whoever put it there.';

-- ============================================================
-- The one-review-each rules only ever meant anything for accounts.
--
-- Postgres already treats NULLs as distinct in a unique index, so relayed
-- rows would not have collided — but leaving that to a default that can be
-- switched off with NULLS NOT DISTINCT is leaving it to luck. Said out loud
-- instead.
-- ============================================================
drop index if exists reviews_one_per_meal;
create unique index reviews_one_per_meal
  on reviews (customer_id, meal_id)
  where meal_id is not null and customer_id is not null;

drop index if exists reviews_one_shop_review;
create unique index reviews_one_shop_review
  on reviews (customer_id)
  where meal_id is null and customer_id is not null;

create index if not exists idx_reviews_source on reviews(source);

-- ============================================================
-- 4. A customer can only ever post as themselves
--
-- The guards from 0009 clamped the staff-only columns. There are three more
-- now, and they are the ones that matter most: without this clamp a customer
-- could PATCH a review of their own into `source = 'relayed'` with any name
-- on it, or edit the name on somebody else's relayed review. RLS gates rows,
-- not columns, which is why this is a trigger.
-- ============================================================
create or replace function guard_review_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.shop_reply := null;
    new.shop_replied_at := null;
    new.is_hidden := false;
    -- Whatever arrived, this is a customer posting under their own account.
    new.source := 'customer';
    new.customer_id := auth.uid();
    new.author_name := null;
    new.relayed_by := null;
  end if;

  -- Stamp who typed it in, from the session rather than from the payload.
  if new.source = 'relayed' and new.relayed_by is null then
    new.relayed_by := auth.uid();
  end if;

  return new;
end;
$$;

create or replace function guard_review_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.shop_reply := old.shop_reply;
    new.shop_replied_at := old.shop_replied_at;
    new.is_hidden := old.is_hidden;
    -- A review cannot change what kind of thing it is, or whose it is.
    new.source := old.source;
    new.customer_id := old.customer_id;
    new.author_name := old.author_name;
    new.relayed_by := old.relayed_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
-- 5. Writing a relayed review
--
-- The insert policy from 0009 already lets staff insert freely, which is what
-- a relayed review needs. Two things it does not say, and this does:
--
--   * a relayed review must be inserted by someone who works here, or by the
--     service role — which is how every write from the app itself arrives,
--     after the action has checked the capability.
--   * nobody may relay a review from a signed-in session that is not staff.
--
-- AS RESTRICTIVE, and that word is the whole thing. Permissive policies are
-- OR-ed together, so a second permissive insert policy would have *widened*
-- what may be written rather than narrowing it — the existing policy would
-- still let a customer through on its own. A restrictive policy is AND-ed:
-- both must hold.
-- ============================================================
drop policy if exists "staff_only_relayed_reviews" on reviews;
create policy "staff_only_relayed_reviews" on reviews
  as restrictive for insert
  with check (source = 'customer' or auth.uid() is null or is_staff());

comment on table reviews is
  'Ratings and comments. A row is either a customer''s own (source = customer, keyed to their account) or one the shop was sent on Messenger and typed in (source = relayed, name on the row). Both count towards the public average; the cards say which is which.';
