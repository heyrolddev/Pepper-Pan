-- ============================================================
-- Order tickets, so an order has a handle a person can say and search.
--
-- Every order already had an id — a uuid. The activity log printed it in
-- full, which is how the owner ended up with lines like "set order
-- 3f9c1a8e-… to completed": a record of something they cannot look up,
-- because nobody types thirty-six characters into a search box and the
-- customer at the counter was never told that number.
--
-- So every order gets a short serial as well. Sequential and global, not
-- per-day: a per-day counter means a dozen "#0001"s and a search that finds
-- all of them, which is the same dead end in a shorter form.
--
-- Backfilled oldest-first so the numbers read like the shop's own history,
-- and unique, because a handle that can repeat is not a handle.
-- ============================================================

create sequence if not exists order_ticket_seq as bigint;

alter table orders add column if not exists ticket bigint;

do $$
declare
  r record;
  n bigint := 0;
begin
  for r in select id from orders where ticket is null order by created_at asc, id asc loop
    n := n + 1;
    update orders set ticket = n where id = r.id;
  end loop;

  -- Past everything already numbered. `true` on a populated table so the
  -- next order takes max+1; `false` on an empty one so the first takes 1
  -- rather than 2.
  if exists (select 1 from orders where ticket is not null) then
    perform setval('order_ticket_seq', (select max(ticket) from orders), true);
  else
    perform setval('order_ticket_seq', 1, false);
  end if;
end $$;

alter table orders alter column ticket set default nextval('order_ticket_seq');
alter table orders alter column ticket set not null;

create unique index if not exists idx_orders_ticket on orders(ticket);

comment on column orders.ticket is
  'Short serial the shop and the customer can both say out loud. Global and sequential, printed on the receipt, and what the activity log points at.';

-- ------------------------------------------------------------
-- Restoring a backup writes orders with the ticket numbers they had, which
-- can sit above where the live sequence is — and then the next real order
-- collides with a restored one and the insert fails. Called by the restore
-- action once the rows are in.
-- ------------------------------------------------------------
create or replace function sync_order_ticket_seq()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  top bigint;
begin
  select coalesce(max(ticket), 0) into top from orders;
  if top > 0 then
    perform setval('order_ticket_seq', top, true);
  else
    perform setval('order_ticket_seq', 1, false);
  end if;
  return top;
end $$;

revoke all on function sync_order_ticket_seq() from public, anon, authenticated;

comment on function sync_order_ticket_seq is
  'Move the ticket sequence past the highest ticket in the table. For after a restore, which brings its own numbers.';
