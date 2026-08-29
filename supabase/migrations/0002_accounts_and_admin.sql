-- Pepper Pan — accounts, customer verification, and admin access
-- Run this once in the Supabase SQL Editor, after 0001_init.sql.

-- ============================================================
-- PROFILES: customer details + owner-controlled trust flags
-- ============================================================
alter table profiles add column if not exists address text;
alter table profiles add column if not exists is_verified boolean not null default false;
alter table profiles add column if not exists is_blocked boolean not null default false;
alter table profiles add column if not exists updated_at timestamptz not null default now();

-- Capture the name/phone collected on the sign-up form.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- RLS can gate whole rows but not individual columns, so a trigger keeps
-- customers from promoting themselves or self-verifying by PATCHing their
-- own profile row (which they are otherwise allowed to update).
create or replace function guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() is null for the service-role key and the SQL Editor, i.e.
  -- trusted server-side contexts (RLS already blocks anonymous callers from
  -- reaching this table at all). Only clamp privileged columns for a real
  -- signed-in user who is not the owner.
  if auth.uid() is not null and not is_owner() then
    new.role := old.role;
    new.is_verified := old.is_verified;
    new.is_blocked := old.is_blocked;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on profiles;
create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function guard_profile_privileges();

-- Staff need to see customer profiles to sanity-check an order; previously
-- only owners could.
drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select
  using (id = auth.uid() or is_staff());

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update
  using (id = auth.uid() or is_staff())
  with check (id = auth.uid() or is_staff());

-- ============================================================
-- ORDERS: blocked accounts cannot place orders
-- ============================================================
drop policy if exists "customer_insert_own_orders" on orders;
create policy "customer_insert_own_orders" on orders for insert
  with check (
    is_staff()
    or (
      customer_id = auth.uid()
      and not exists (
        select 1 from profiles p where p.id = auth.uid() and p.is_blocked
      )
    )
  );

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created_at on orders(created_at desc);

-- ============================================================
-- Promote the shop owner.
-- Replace the email below with the account that should own the shop,
-- then re-run just this statement.
-- ============================================================
-- update profiles set role = 'owner'
-- where id = (select id from auth.users where email = 'you@example.com');
