-- ============================================================
-- Days the shop traded before it had this till
--
-- The stall ran for months on a notebook. Those takings are real and nothing
-- here knows about them, which costs more than it sounds: the sales trend has
-- nothing to draw, and the forecast refuses to speak until it has six
-- completed weeks. Typing the old days in is the difference between waiting
-- six weeks for an answer and having one today.
--
-- A past day is saved as an ORDER, because every screen that reports money
-- already reads orders and a second source of truth would have to be wired
-- into each of them one at a time — which is exactly how a figure ends up
-- right on one page and wrong on another. The legacy importer made the same
-- call for the same reason: historical sales arrive as completed walk-ins.
--
-- It is marked, though. One entry carries a whole day, so anything counting
-- the NUMBER of orders is wrong about these rows even though the money is
-- right, and a screen cannot warn about what it cannot see.
-- ============================================================

alter table orders
  add column if not exists is_backfill boolean not null default false;

create index if not exists idx_orders_backfill
  on orders(date) where is_backfill;

comment on column orders.is_backfill is
  'A whole day of pre-till takings typed in as one row. The money is real; '
  'the order COUNT is not — forty walk-ins are one row. Never has stock '
  'applied: the food was eaten months ago and deducting it now would empty a '
  'shelf that is actually full.';

-- ============================================================
-- And make it visible
--
-- Column grants on `orders` are enumerated, not table-wide — the cost columns
-- are hidden from staff — so a newly added column is readable by nobody until
-- this runs. The behaviour check in scripts/migration-check catches a
-- migration that forgets, which is how this line came to be here.
-- ============================================================
select regrant_visible_columns();
