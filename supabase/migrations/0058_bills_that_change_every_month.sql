-- ============================================================
-- The bills are not fixed, and pretending they are hides the one thing
-- they are worth reading
--
-- `fixed_costs` holds one amount per bill, forever. Kuryente is ₱2,000 and
-- stays ₱2,000 on this screen until somebody edits it — so the month it came
-- in at ₱3,100 left no trace at all, and the month it dropped to ₱1,200 left
-- none either. The number that matters about a utility bill is not its level;
-- it is its MOVEMENT. A stall that cannot see kuryente climbing cannot ask
-- why, and by the time a flat figure gets edited the reason is months gone.
--
-- So a bill becomes two things:
--
--   `fixed_costs` stays as the LIST — kuryente, tubig, rent, sweldo, wifi.
--   One row per thing that arrives every month. Its `amount` stops being the
--   truth and becomes a fallback: what to assume until a real month is
--   recorded against it.
--
--   `monthly_bills` holds what each of them ACTUALLY came to, one row per
--   bill per month. That is the history, and it is the whole point.
--
-- Nothing is backfilled. Copying today's `fixed_costs.amount` into September
-- would write a figure nobody has ever seen a bill for, and it would be
-- indistinguishable from a real one the day after. An estimate that knows it
-- is an estimate is worth more than a fact that isn't one.
-- ============================================================

-- ------------------------------------------------------------
-- 1. What kind of bill it is
--
-- Not decoration: "is the electricity climbing" and "is the rent climbing"
-- are different questions with different answers available to the owner, and
-- a screen that cannot tell a utility from a wage cannot group them. Text
-- with a check rather than an enum, for the reason 0042 and 0045 both gave —
-- adding a kind later is one migration, not a type rewrite.
-- ------------------------------------------------------------
alter table fixed_costs
  add column if not exists kind text not null default 'overhead';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fixed_costs_kind_known') then
    alter table fixed_costs add constraint fixed_costs_kind_known
      check (kind in ('utility', 'rent', 'wage', 'overhead', 'misc'));
  end if;
end $$;

comment on column fixed_costs.kind is
  'utility (kuryente, tubig, wifi) | rent | wage | overhead | misc. Utilities '
  'are the ones worth watching month to month — they move with consumption, '
  'and the rest mostly do not.';

comment on column fixed_costs.amount is
  'NOT what the bill is. It is what to ASSUME until a real month is recorded '
  'in monthly_bills — the estimate a new shop starts from. Once any month is '
  'recorded for this bill, the recorded months are used and this is ignored.';

-- ------------------------------------------------------------
-- 2. What it actually came to, month by month
--
-- `month` is always the first of the month, enforced rather than trusted. A
-- bill recorded as the 14th and the same bill recorded as the 1st are two
-- rows for one month otherwise, and the unique index below — the thing that
-- stops a bill being entered twice — would not catch it.
-- ------------------------------------------------------------
create table if not exists monthly_bills (
  id uuid primary key default gen_random_uuid(),

  fixed_cost_id text not null references fixed_costs(id) on delete cascade,

  /* The first of the month it covers. */
  month date not null,

  amount numeric(12, 2) not null,

  note text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,

  constraint monthly_bills_month_is_first check (extract(day from month) = 1),
  /* Zero is a real answer — a month with no water bill is information, and
     it is not the same as no entry at all. Negative is not. */
  constraint monthly_bills_amount_not_negative check (amount >= 0),

  /* One bill, one month, one figure. Entering kuryente twice for September
     is a typo every time, and silently doubling break-even is what it would
     otherwise do. */
  constraint monthly_bills_one_per_month unique (fixed_cost_id, month)
);

comment on table monthly_bills is
  'What each recurring bill actually came to in a given month. The history '
  'that a single fixed amount destroyed: ₱3,100 in July, ₱1,200 in August, '
  '₱2,000 in September is a consumption trend; one number that says ₱2,000 '
  'is not.';

create index if not exists idx_monthly_bills_month
  on monthly_bills(month desc);
create index if not exists idx_monthly_bills_bill
  on monthly_bills(fixed_cost_id, month desc);

-- ------------------------------------------------------------
-- 3. Who may see it
--
-- The same wall `fixed_costs` sits behind, and for the reason 0024 gave when
-- it took the staff read away: what the shop pays its landlord, and now what
-- it paid for electricity in July, is the owner's business. A per-month
-- history is strictly MORE revealing than the flat figure was, so inheriting
-- anything looser than the table it hangs off would be a leak opened by a
-- feature that improved a screen.
-- ------------------------------------------------------------
alter table monthly_bills enable row level security;

drop policy if exists "owner_manage_monthly_bills" on monthly_bills;
create policy "owner_manage_monthly_bills" on monthly_bills
  for all using (is_owner()) with check (is_owner());
