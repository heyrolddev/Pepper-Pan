-- Pepper Pan — order lifecycle: ETA, customer cancel/edit, live updates
-- Run this once in the Supabase SQL Editor, after 0003.

-- ============================================================
-- ORDERS — store-set ETA + cancellation trail
-- ============================================================
alter table orders add column if not exists eta_minutes integer;
alter table orders add column if not exists cancelled_reason text;
alter table orders add column if not exists updated_at timestamptz not null default now();

-- So the customer's tracking view can say "updated 2 minutes ago" and the
-- realtime payload always carries a fresh timestamp to sort/compare on.
create or replace function touch_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on orders;
create trigger orders_touch_updated_at
  before update on orders
  for each row execute function touch_order_updated_at();

-- ============================================================
-- A customer may cancel or edit their own order while it is still pending.
--
-- The old policy's WITH CHECK required the *new* row to be 'pending', which
-- made cancelling impossible: the row being written has status 'cancelled',
-- so every self-cancel was rejected. USING still gates on the pre-update row
-- being pending, so this cannot touch an order the shop already started.
-- ============================================================
drop policy if exists "customer_update_own_orders" on orders;
create policy "customer_update_own_orders" on orders for update
  using (is_staff() or (customer_id = auth.uid() and status = 'pending'))
  with check (
    is_staff()
    or (customer_id = auth.uid() and status in ('pending', 'cancelled'))
  );

-- ============================================================
-- ORDER LINES — a customer may change the contents of a pending order.
-- Every policy re-checks the parent order is theirs AND still pending, so
-- editing stops the moment the kitchen confirms it.
-- ============================================================
drop policy if exists "insert_own_order_lines" on order_lines;
create policy "insert_own_order_lines" on order_lines for insert
  with check (
    is_staff()
    or exists (
      select 1 from orders o
      where o.id = order_lines.order_id
        and o.customer_id = auth.uid()
        and o.status = 'pending'
    )
  );

drop policy if exists "staff_manage_order_lines" on order_lines;
create policy "staff_manage_order_lines" on order_lines for update
  using (
    is_staff()
    or exists (
      select 1 from orders o
      where o.id = order_lines.order_id
        and o.customer_id = auth.uid()
        and o.status = 'pending'
    )
  )
  with check (
    is_staff()
    or exists (
      select 1 from orders o
      where o.id = order_lines.order_id
        and o.customer_id = auth.uid()
        and o.status = 'pending'
    )
  );

drop policy if exists "staff_delete_order_lines" on order_lines;
create policy "staff_delete_order_lines" on order_lines for delete
  using (
    is_staff()
    or exists (
      select 1 from orders o
      where o.id = order_lines.order_id
        and o.customer_id = auth.uid()
        and o.status = 'pending'
    )
  );

-- ============================================================
-- REALTIME — so a new order appears on the admin screen and a status change
-- appears on the customer's screen without either of them refreshing.
-- Postgres has no "add table if not a member", hence the guard.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;
end
$$;

-- Realtime only delivers the columns it can read, and for UPDATE payloads the
-- old row is only included when the table has a full replica identity.
alter table orders replica identity full;
