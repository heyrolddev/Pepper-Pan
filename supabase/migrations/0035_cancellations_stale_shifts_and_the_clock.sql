-- ============================================================
-- Three holes, found by reading the code back after the shift gate went in.
-- ============================================================


-- ============================================================
-- 1. Who cancelled it, when, and why.
--
-- `cancelled_reason` has existed since the first migration and only ONE code
-- path ever wrote to it: the customer cancelling their own order. When the
-- shop cancelled from HQ — the action that takes money back out of the
-- drawer — nothing was recorded at all. No reason, no name, no time.
--
-- That is the gap that made the new cash history unable to name a reversal:
-- `logged_by` says who rang the sale UP, which is very often not who
-- cancelled it, and a confident wrong name sends the owner to ask the wrong
-- person about missing money.
-- ============================================================

alter table orders add column if not exists cancelled_by uuid references profiles(id) on delete set null;
alter table orders add column if not exists cancelled_at timestamptz;

comment on column orders.cancelled_by is
  'Who cancelled it, stamped at the moment of cancelling. Distinct from logged_by, which is who took the order.';
comment on column orders.cancelled_at is
  'When it was cancelled. Distinct from date, which is when it was sold.';

create index if not exists idx_orders_cancelled_by on orders(cancelled_by) where cancelled_by is not null;


-- ============================================================
-- 2. A shift nobody closed.
--
-- This became a much bigger problem than it was. Before the clock gated
-- anything, a forgotten shift was a wrong number in a report. Now that an
-- open shift is the key to the whole shop floor, a shift nobody closed is a
-- key nobody took back — and one that never gets a drawer count either.
--
-- There is no scheduled job on this project, so this cannot be a cron. It is
-- a function the app calls when HQ is opened, which is both often enough to
-- matter and free when there is nothing to close. `closing_cash` is left null
-- deliberately: nobody counted, and the report says so rather than inventing
-- a figure.
--
-- The column guard from 0018 does not interfere — it only pins columns when
-- `auth.uid()` is not null, and this runs from the service role.
-- ============================================================

alter table staff_shifts add column if not exists auto_closed boolean not null default false;

comment on column staff_shifts.auto_closed is
  'True when the shift was closed by close_stale_shifts rather than by the person. Means nobody counted the drawer.';

create or replace function close_stale_shifts(p_hours int default 14)
returns setof staff_shifts
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update staff_shifts
  set ended_at = now(),
      auto_closed = true,
      note = case
               when coalesce(btrim(note), '') = ''
                 then 'Closed automatically — nobody clocked out, so the drawer was never counted.'
               else note || ' · Closed automatically — nobody clocked out.'
             end
  where ended_at is null
    and started_at < now() - make_interval(hours => greatest(1, p_hours))
  returning *;
end $$;

revoke all on function close_stale_shifts(int) from public, anon, authenticated;

comment on function close_stale_shifts is
  'Close shifts left running past p_hours. Returns the rows it closed so the caller can tell the owner.';


-- ============================================================
-- 3. The clock, at the database.
--
-- The gate that came with the ticket work lives in server actions only. The
-- project''s own permissions file says a permission has to hold in two places
-- — the action and the policy behind it — and this one held in one. A staff
-- session carries a token the browser can see, so a clocked-out staff member
-- could PATCH /rest/v1/orders directly and every server-side check would be
-- irrelevant.
--
-- Not done by rewriting policies. There are thirty-odd `is_staff()` write
-- policies spread over nine migrations, and reconstructing that set correctly
-- from the files is exactly the sort of job that silently loosens one of them.
-- A trigger says the same thing once, cannot be bypassed by the REST API, and
-- leaves every existing policy exactly as it is — so nothing that works today
-- can break.
--
-- Three ways through it, all deliberate:
--   no auth.uid()   the service role, which is how every legitimate write
--                   from the app arrives, after the action checked the clock
--   not staff       a customer placing or cancelling their own order. Their
--                   own policies govern that and this must not second-guess
--                   them
--   the owner       not on a rota, and there is nobody above them for the
--                   record to protect
-- ============================================================

create or replace function require_open_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean := true;
begin
  if auth.uid() is not null and is_staff() and not is_owner() then
    allowed := exists (
      select 1 from staff_shifts
      where staff_id = auth.uid() and ended_at is null
    );
  end if;

  if not allowed then
    -- 42501 is insufficient_privilege, which is what this is: the person may
    -- do this, just not right now.
    raise exception 'Not clocked in. Start a shift before changing anything — the shift is what puts your name on it.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

comment on function require_open_shift is
  'Refuse a shop-floor write from a staff session with no open shift. The service role, customers and the owner pass through.';

-- The shop''s own records. Deliberately NOT staff_shifts (that is how someone
-- clocks in), profiles (their own account), push_subscriptions or
-- device_sessions (a phone should still be able to register while off shift).
do $$
declare
  t text;
  targets text[] := array[
    'orders', 'order_lines', 'order_packaging',
    'meals', 'menu_categories', 'meal_ingredients', 'meal_components', 'meal_packaging',
    'ingredients', 'ingredient_lots', 'batches', 'batch_ingredients',
    'purchase_log', 'consumption_log', 'cycle_counts', 'waste_log',
    'cash_ledger', 'receivables', 'fixed_costs', 'assets', 'oe_templates',
    'activity_log', 'faq_entries', 'chat_threads', 'chat_messages', 'chat_settings',
    'announcements', 'settings', 'shop_hours', 'shop_closures',
    'delivery_settings', 'payment_settings', 'shop_settings'
  ];
begin
  foreach t in array targets loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t) then
      execute format('drop trigger if exists %I on %I', 'require_shift_' || t, t);
      execute format(
        'create trigger %I before insert or update or delete on %I
           for each row execute function require_open_shift()',
        'require_shift_' || t, t
      );
    end if;
  end loop;
end $$;
