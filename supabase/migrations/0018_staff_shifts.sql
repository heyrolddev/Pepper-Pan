-- ============================================================
-- Shifts
--
-- The owner wants to see what time staff worked and what they did. Supabase
-- already stores `last_sign_in_at` for free — but a login is not a shift.
-- Someone can sign in from home, or stay signed in for a week; paying
-- someone from that number would be wrong in both directions.
--
-- A shift is clocked in and clocked out deliberately, and everything done in
-- between is stamped with it. That is what turns "Maria was online at 4pm"
-- into "Maria worked 4:00 to 10:30, rang up ₱8,420, and the drawer was ₱520
-- short" — which is the question actually being asked.
-- ============================================================

create table if not exists staff_shifts (
  id text primary key default gen_random_uuid()::text,
  staff_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  /* What was counted in the drawer at the end. Null until clock-out, and
     still null after it if nobody counted — which is different from zero. */
  closing_cash numeric,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_staff_shifts_staff on staff_shifts(staff_id, started_at desc);

-- One open shift per person. Without this, a double tap on Clock in leaves
-- two open shifts and every later sale has to guess which one it belongs to.
create unique index if not exists idx_staff_shifts_one_open
  on staff_shifts(staff_id) where ended_at is null;

-- Which shift rang this up. Nullable: online orders belong to no shift, and
-- so does everything recorded before today.
alter table orders add column if not exists shift_id text references staff_shifts(id);
create index if not exists idx_orders_shift on orders(shift_id);

alter table staff_shifts enable row level security;

/* A shift the person being paid can rewrite is not a payroll record. RLS can
   gate whole rows but not individual columns, so — the same trick that keeps
   customers from promoting themselves in `guard_profile_privileges` — a
   trigger pins the parts that decide what someone is owed. Staff may close
   their own shift and leave a note; they may not move when it started, whose
   it is, or reopen one that has been closed. */
create or replace function guard_shift_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not is_owner() then
    new.staff_id := old.staff_id;
    new.started_at := old.started_at;
    new.created_at := old.created_at;
    if old.ended_at is not null then
      -- A closed shift is a finished record. Reopening it, or moving the
      -- drawer count it was closed with, would erase exactly the number a
      -- shortfall is worked out from.
      new.ended_at := old.ended_at;
      new.closing_cash := old.closing_cash;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_shifts_guard on staff_shifts;
create trigger staff_shifts_guard
  before update on staff_shifts
  for each row execute function guard_shift_columns();

/* Staff read their own shifts and nothing else. They do not get INSERT or
   UPDATE at all: clocking in and out goes through the two functions above,
   which only the service role may call, so the app can open and close a
   shift while a staff session cannot touch the row directly.

   That is least privilege rather than caution for its own sake — an UPDATE
   policy scoped to "your own rows" still lets the person being paid edit the
   record of what they are owed, and the trigger above then has to be the
   only thing standing between them and their own timesheet.

   Nobody deletes a shift. A missing shift and a shift that never happened
   look identical, and only one of them is honest. */
drop policy if exists "staff_insert_own_shift" on staff_shifts;
drop policy if exists "staff_update_own_shift" on staff_shifts;

drop policy if exists "staff_select_shifts" on staff_shifts;
create policy "staff_select_shifts" on staff_shifts
  for select using (staff_id = auth.uid() or is_owner());

drop policy if exists "owner_manage_shifts" on staff_shifts;
create policy "owner_manage_shifts" on staff_shifts
  for update using (is_owner()) with check (is_owner());

-- ============================================================
-- Clocking in and out
--
-- Functions rather than plain inserts so "am I already clocked in?" is
-- answered by the database rather than by a browser that may have been open
-- since yesterday. Both return the shift so the caller can render it.
-- ============================================================
create or replace function clock_in(p_staff_id uuid)
returns staff_shifts
language plpgsql
as $$
declare
  v_shift staff_shifts;
begin
  -- Already clocked in? Hand back the shift that is running rather than
  -- refusing: two devices, or a reloaded page, must not become an error the
  -- person has to think about mid-service.
  select * into v_shift from staff_shifts
  where staff_id = p_staff_id and ended_at is null
  order by started_at desc limit 1;
  if found then
    return v_shift;
  end if;

  insert into staff_shifts (staff_id) values (p_staff_id) returning * into v_shift;
  return v_shift;
end;
$$;

create or replace function clock_out(
  p_staff_id uuid,
  p_closing_cash numeric default null,
  p_note text default null
)
returns staff_shifts
language plpgsql
as $$
declare
  v_shift staff_shifts;
begin
  update staff_shifts
  set ended_at = now(),
      closing_cash = p_closing_cash,
      note = nullif(btrim(coalesce(p_note, '')), '')
  where staff_id = p_staff_id and ended_at is null
  returning * into v_shift;

  -- Nothing open is not an error: the shift may have been closed on another
  -- device a moment ago. Returned as null rather than as a row of nulls,
  -- which is what falls out of a composite-returning function by default and
  -- would reach the app looking like a shift with no id.
  if not found then
    return null;
  end if;
  return v_shift;
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'clock_in(uuid)',
    'clock_out(uuid, numeric, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
