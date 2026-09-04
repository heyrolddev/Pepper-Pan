-- ============================================================
-- 0028 — Which devices may open HQ, and offering someone a job
--
-- Two things the shop asked for, and one hole they would have opened.
--
-- 1. Manager and staff work from one device. A second one has to be let in
--    by the owner. The owner themselves is never gated: they are the only
--    person who can approve anything, so locking them out would lock out
--    everybody, permanently, with no way back in.
--
-- 2. A role is offered, not applied. The person accepts it on their own
--    account, and only then does it take effect — so nobody wakes up with
--    access they did not know they had, and there is a record of them
--    agreeing to it.
--
-- The hole: `pending_role` decides what someone becomes when they accept.
-- Row Level Security already lets a signed-in person update their own
-- profile row, and it cannot restrict that to particular columns. Without
-- the change to the guard trigger at the bottom of this file, any customer
-- could PATCH `pending_role = 'manager'` onto themselves and then accept it.
-- The offer columns are exactly as privileged as `role` is, and are clamped
-- with it.
-- ============================================================

-- ------------------------------------------------------------
-- Devices
-- ------------------------------------------------------------
create table if not exists device_sessions (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Minted by the middleware into a first-party cookie. Not a fingerprint:
  -- it identifies a browser profile, not a person or a machine, and clearing
  -- site data legitimately makes a new one.
  device_id text not null,
  -- "Chrome on Android", from the user agent. For recognising your own
  -- phone in a list, nothing more — it is a hint, not evidence.
  label text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  unique (user_id, device_id)
);

create index if not exists idx_device_sessions_user on device_sessions(user_id);
create index if not exists idx_device_sessions_status on device_sessions(status);

alter table device_sessions enable row level security;

-- Readable by the person it belongs to, and by the owner who has to decide.
-- Every write goes through a server action on the service-role key: a
-- device approving itself is the one thing this table exists to prevent.
drop policy if exists "read_own_devices" on device_sessions;
create policy "read_own_devices" on device_sessions for select
  using (user_id = auth.uid() or is_owner());

-- ------------------------------------------------------------
-- Offering a role
-- ------------------------------------------------------------
alter table profiles add column if not exists pending_role text;
alter table profiles add column if not exists role_offered_at timestamptz;
alter table profiles add column if not exists role_offered_by uuid references auth.users(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_pending_role_check'
  ) then
    alter table profiles add constraint profiles_pending_role_check
      -- 'owner' is in here on purpose. With exactly one owner account, every
      -- answer to "what if they lose their phone" runs through this
      -- dashboard, and if that is lost too there is no answer at all. A
      -- second owner is the only recovery plan that needs nobody's help.
      check (pending_role is null or pending_role in ('owner', 'manager', 'staff'));
  end if;
end $$;

-- ------------------------------------------------------------
-- The guard, widened
--
-- Unchanged in what it does — clamp privileged columns for any signed-in
-- caller who is not the owner — and widened to cover the three columns
-- added above. `auth.uid()` is null for the service-role key and the SQL
-- editor, which is how the server actions are still able to write them.
-- ------------------------------------------------------------
create or replace function guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not is_owner() then
    new.role := old.role;
    new.is_verified := old.is_verified;
    new.is_blocked := old.is_blocked;
    -- An offer is as privileged as the role it turns into. Writing your own
    -- would be a promotion you then accept from yourself.
    new.pending_role := old.pending_role;
    new.role_offered_at := old.role_offered_at;
    new.role_offered_by := old.role_offered_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on profiles;
create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function guard_profile_privileges();
