-- ============================================================
-- 0051 — A spend you can take back
--
-- `deleteRunningCost` has existed since 0045 and no screen has ever called
-- it, so a mistyped spend — ₱2,500 of paper towels instead of ₱250 — has been
-- permanent. The button that fixes that is the reason for this migration,
-- because deleting the row on its own would leave the shop worse off than the
-- typo did.
--
-- WHY A COLUMN AND NOT JUST A DELETE
--
-- `recordSpend` writes two rows, not one: the purchase into `running_costs`
-- (or `assets`), and — when the money came out of a pot rather than being
-- taken on utang — a matching `out` line in `cash_ledger`. Nothing has ever
-- connected the two. Remove the purchase alone and the pesos stay gone from
-- the drawer, attached to a note naming a spend that no longer exists
-- anywhere: the drawer fails its physical count and the money screen offers
-- no explanation. That is precisely the silent failure this system keeps
-- having to design against, and it is worse than the typo it was meant to
-- correct.
--
-- Matching the two back up by amount and date was the alternative, and it is
-- the wrong kind of clever: two ₱250 refills on the same day are ordinary,
-- and a heuristic that deletes the wrong ledger line is a bug nobody would
-- ever catch. So the link is written down at the moment it is known, which is
-- the moment `recordSpend` creates both rows.
--
-- WHY NULL IS A REAL ANSWER
--
-- Two different spends legitimately have no ledger line: one taken on utang
-- (the money has not moved yet — it moves when the debt is settled), and
-- every row recorded before today, which predates the column. The delete
-- dialog reads this and says which case it is looking at, rather than
-- claiming a certainty it does not have.
--
-- ON DELETE SET NULL, not CASCADE: a ledger line removed by hand must never
-- take a purchase record with it. The cash ledger is where money is
-- reconciled; the purchase is what the shop actually bought, and the second
-- outliving the first is the harmless direction.
-- ============================================================

alter table running_costs
  add column if not exists ledger_id text references cash_ledger(id) on delete set null;

comment on column running_costs.ledger_id is
  'The cash_ledger line this spend wrote, or NULL when it moved no money (utang) or predates 0051. Removing the spend removes that line first, so the drawer comes back to where it was.';

create index if not exists idx_running_costs_ledger
  on running_costs(ledger_id)
  where ledger_id is not null;

-- Assets get the same link for the same reason: "Record a spend" writes an
-- asset row and a ledger line just as it writes a running cost and one, and
-- an asset entered by mistake is exactly as stuck as a running cost was.
alter table assets
  add column if not exists ledger_id text references cash_ledger(id) on delete set null;

comment on column assets.ledger_id is
  'The cash_ledger line this purchase wrote, or NULL when it moved no money or predates 0051.';
