-- ============================================================
-- 0042 — Where the money actually sits, and buying stock taking it out
--
-- TWO PROBLEMS, ONE CAUSE
--
-- 1. Restocking never moved any money. `recordRestock` writes the lot, the
--    stock level, the purchase log and the activity log — and nothing to
--    `cash_ledger`. So "Cash in the drawer" has been counting every sale in
--    and never counting the ingredients out. On a shop that restocks weekly
--    it does not drift a little; it reads permanently high by the total of
--    every delivery ever taken. The screen's own help text admits the gap —
--    "that gap is usually a labas for supplies that nobody wrote down" — and
--    treats it as the owner's job to type in. It should not be: the restock
--    form already knows the peso amount, and asking somebody to write the
--    same number twice is how the second one stops happening.
--
-- 2. `cash_ledger` has no idea which pot a movement came out of. That was
--    fine while the only pot was the drawer, and GCash was excluded on
--    purpose — that money never touched the drawer, so counting it there
--    would make the drawer look permanently over. But the owner does hold
--    GCash, and "what does the shop have" is a real question that the drawer
--    alone cannot answer.
--
-- The fix for both is the same: a ledger line has to say which account it
-- moved. Then buying stock with GCash and buying it with cash are two
-- different, correctly-recorded events instead of one untracked one.
--
-- WHY NOT JUST ADD GCASH INTO THE DRAWER FIGURE
--
-- Because the drawer number's whole job is that it can be checked. You count
-- the physical cash and compare, and a gap means something real — usually an
-- unrecorded purchase. Fold an untouchable GCash balance into it and that
-- check is gone, and with it the only self-correcting thing in the money
-- screen. The accounts stay separate and are added up for the total.
-- ============================================================

-- 'cash' | 'gcash' | 'bank'. Text with a check rather than an enum: adding a
-- pot later should be one migration, not a type rewrite.
alter table cash_ledger
  add column if not exists account text not null default 'cash';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cash_ledger_account_known'
  ) then
    alter table cash_ledger
      add constraint cash_ledger_account_known
      check (account in ('cash', 'gcash', 'bank'));
  end if;
end $$;

comment on column cash_ledger.account is
  'Which pot this moved: cash (the drawer), gcash (the e-wallet), or bank. Every row before this migration was the drawer, which is what the default backfills.';

-- The balance per account is read as "every row for this pot since the start
-- date", which is exactly this index.
create index if not exists idx_cash_ledger_account_date
  on cash_ledger(account, date desc);

-- ------------------------------------------------------------
-- The GCash pot needs the same two facts the drawer has: what was in it when
-- counting started, and from when. Without a start date the balance would be
-- every GCash sale since the shop opened, which is not a balance — it is a
-- total, and it would only ever go up.
-- ------------------------------------------------------------
alter table settings
  add column if not exists gcash_balance_enabled boolean not null default false;

alter table settings
  add column if not exists gcash_balance_starting_amount numeric not null default 0;

alter table settings
  add column if not exists gcash_balance_start_date date;

comment on column settings.gcash_balance_enabled is
  'Whether the shop is counting its e-wallet balance. Off by default: a balance nobody has opened is better absent than wrong.';
