-- ============================================================
-- 0030 — Where a cash movement came from
--
-- `cash_ledger` records that ₱250 left the till. It does not record whether
-- that was a sack of flour or the electricity bill, and those are different
-- facts: one is cost of goods and moves with sales, the other is a fixed
-- monthly cost that does not. A ledger that cannot tell them apart can show
-- the balance but cannot explain it.
--
-- The gap surfaced while importing the owner's records out of the phone app
-- that preceded this system. That app tagged every entry — restock, bill,
-- order, manual — and this table had nowhere to put the tag, so an import
-- would have silently dropped a year of provenance and left 36 amounts with
-- no story.
--
-- Two nullable columns, no default beyond null, no constraint on `source`
-- beyond a comment. Deliberately loose: a check constraint here would mean a
-- new kind of cash movement needs a migration before it can be recorded, and
-- the value of this column is descriptive rather than structural. Existing
-- rows stay exactly as they are, and every query written before today
-- continues to return what it returned.
--
-- `ref_id` points at the row that caused the movement — a `purchase_log` id
-- for a restock, an `orders` id for a sale. Not a foreign key, on purpose:
-- it is polymorphic, the way `order_packaging.ref_id` already is in this
-- schema, and a real FK would need one nullable column per target table.
--
-- Safe to run twice.
-- ============================================================

alter table cash_ledger add column if not exists source text;
alter table cash_ledger add column if not exists ref_id text;

comment on column cash_ledger.source is
  'What kind of movement this was: restock, bill, order, manual. Free text — descriptive, not structural.';
comment on column cash_ledger.ref_id is
  'The row that caused it — a purchase_log or orders id. Polymorphic, so not a foreign key.';

-- Reading the ledger by kind is the point of the column, and the money page
-- already filters a hundred rows at a time.
create index if not exists idx_cash_ledger_source on cash_ledger(source);

-- ============================================================
-- Two more gaps the same import exposed.
--
-- 1. `waste_log.source_type` allowed only 'inv' and 'batch'. The records
--    being imported also waste finished dishes — a plated meal dropped, or
--    one sent back — and 'meal' is a real third kind that the original check
--    simply had not met yet. Without this, four rows of genuine history are
--    rejected by a constraint rather than by anything true about them.
--
-- 2. `purchase_log` records what was bought and from whom, but not who
--    bought it, while `orders`, `waste_log` and `cash_ledger` all record
--    `logged_by`. That asymmetry was an oversight rather than a decision:
--    "who did the shopping" is exactly the sort of question asked a week
--    later, and it is unanswerable once the moment has passed.
--
-- Both additive. Existing rows are untouched and every current query keeps
-- returning what it returned.
-- ============================================================

alter table waste_log drop constraint if exists waste_log_source_type_check;

alter table waste_log add constraint waste_log_source_type_check
  check (source_type is null or source_type in ('inv', 'batch', 'meal'));

alter table purchase_log add column if not exists logged_by text;
