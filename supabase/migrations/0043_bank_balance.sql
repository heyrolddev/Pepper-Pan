-- ============================================================
-- 0043 — The third pot
--
-- 0042 gave every ledger line an account and taught the shop to count two
-- pots: the drawer and the e-wallet. `bank` was already in the check
-- constraint — a ledger line could name it — but there was nowhere to say
-- what was in the account or from when, so it could never show a balance.
--
-- Same two facts as the other two, and off until the owner sets them. A shop
-- with no bank account should see nothing about one, not a row of ₱0.00 that
-- reads as an empty account rather than an absent one.
--
-- Unlike the drawer and the e-wallet, the bank has no sales flowing into it:
-- nobody pays for noodles by bank transfer. Its balance is the opening figure
-- plus whatever the owner records moving in or out, and that is the whole of
-- it — which is why this migration adds columns and no derivation.
-- ============================================================

alter table settings
  add column if not exists bank_balance_enabled boolean not null default false;

alter table settings
  add column if not exists bank_balance_starting_amount numeric not null default 0;

alter table settings
  add column if not exists bank_balance_start_date date;

comment on column settings.bank_balance_enabled is
  'Whether the shop is counting a bank account. Off by default: a shop without one should see nothing rather than a row of zero, which reads as an empty account instead of an absent one.';
