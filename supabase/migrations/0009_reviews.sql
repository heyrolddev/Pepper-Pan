-- Pepper Pan — reviews and 5-star ratings
-- Run this once in the Supabase SQL Editor, after 0008.
--
-- A review with meal_id set rates one dish; meal_id null rates the shop as a
-- whole. Only customers who actually completed an order can review, and only
-- dishes they actually bought — the same anti-fraud stance as the rest of the
-- app, enforced in the database rather than only in the UI.

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  meal_id text references meals(id) on delete cascade,   -- null = the shop
  order_id text references orders(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  shop_reply text,
  shop_replied_at timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One review per customer per dish, and one shop review each. Partial indexes
-- because NULL meal_id would otherwise never collide.
create unique index if not exists reviews_one_per_meal
  on reviews (customer_id, meal_id) where meal_id is not null;
create unique index if not exists reviews_one_shop_review
  on reviews (customer_id) where meal_id is null;

create index if not exists idx_reviews_meal on reviews(meal_id);
create index if not exists idx_reviews_created on reviews(created_at desc);

-- ============================================================
-- "Did this person actually buy it?"
-- ============================================================
create or replace function has_completed_order()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from orders
    where customer_id = auth.uid() and status = 'completed'
  );
$$;

create or replace function has_bought_meal(p_meal_id text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from orders o
    join order_lines l on l.order_id = o.id
    where o.customer_id = auth.uid()
      and o.status = 'completed'
      and l.meal_id = p_meal_id
  );
$$;

-- ============================================================
-- A customer may write and edit their own review, but must not award
-- themselves a shop reply or un-hide a review staff hid. RLS gates rows, not
-- columns, so a trigger clamps the staff-only columns — the same pattern the
-- profiles table uses.
-- ============================================================
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
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reviews_guard_columns on reviews;
create trigger reviews_guard_columns
  before update on reviews
  for each row execute function guard_review_columns();

-- Same clamp on insert: a customer can't publish a review that arrives
-- pre-hidden or carrying a fake shop reply.
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
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_guard_insert on reviews;
create trigger reviews_guard_insert
  before insert on reviews
  for each row execute function guard_review_insert();

-- ============================================================
-- RLS
-- ============================================================
alter table reviews enable row level security;

-- Anyone may read published reviews (the menu shows ratings to visitors who
-- aren't signed in). Authors still see their own if staff hide it, and staff
-- see everything.
drop policy if exists "read_published_reviews" on reviews;
create policy "read_published_reviews" on reviews for select
  using (not is_hidden or customer_id = auth.uid() or is_staff());

-- Writing requires a completed order — and for a dish review, having bought
-- that dish. This is what stops invented reviews.
drop policy if exists "customer_insert_own_review" on reviews;
create policy "customer_insert_own_review" on reviews for insert
  with check (
    is_staff()
    or (
      customer_id = auth.uid()
      and not exists (
        select 1 from profiles p where p.id = auth.uid() and p.is_blocked
      )
      and (
        (meal_id is null and has_completed_order())
        or (meal_id is not null and has_bought_meal(meal_id))
      )
    )
  );

drop policy if exists "customer_update_own_review" on reviews;
create policy "customer_update_own_review" on reviews for update
  using (customer_id = auth.uid() or is_staff())
  with check (customer_id = auth.uid() or is_staff());

drop policy if exists "customer_delete_own_review" on reviews;
create policy "customer_delete_own_review" on reviews for delete
  using (customer_id = auth.uid() or is_staff());

-- ============================================================
-- Per-dish averages, for the menu.
-- security_invoker so the reader's own RLS decides what feeds the average —
-- a hidden review must not quietly influence a public score.
-- ============================================================
create or replace view meal_ratings
with (security_invoker = on)
as
  select
    meal_id,
    round(avg(rating)::numeric, 2) as avg_rating,
    count(*)::int as review_count
  from reviews
  where meal_id is not null and not is_hidden
  group by meal_id;
