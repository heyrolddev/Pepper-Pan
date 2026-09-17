-- ============================================================
-- 0044 — Did the marketing work?
--
-- The shop spends money to bring people in: a boosted post, a tarpaulin, a
-- free taste at the fiesta, ₱20 off for a week. Nothing anywhere records
-- whether any of it worked, so the decision about next month's budget is made
-- from memory — and memory reliably remembers the busy week and forgets that
-- the shop was already busy.
--
-- This table is the shop's own record of those attempts, and the numbers it
-- takes to judge them: what it cost, what a normal day took before it, and
-- what a day took while it ran.
--
-- WHY IT TOUCHES NO MONEY
--
-- Deliberately, and this is the important line in the file. Nothing here
-- writes to `cash_ledger`, nothing here is an `order`, and no balance in
-- Pepper Pan Bank moves by a peso because a row lands in this table. The
-- ledger is the shop's account of what actually happened to its money; this
-- is the shop's working-out about whether an idea was any good. Mixing them
-- would corrupt the one number the owner can check by counting the drawer.
--
-- The ad money itself, when it leaves the shop, is a Money out line in the
-- drawer like any other spend. That is the record. This is the argument.
--
-- WHY THE INPUTS ARE STORED AND NOT THE VERDICT
--
-- Every figure a screen shows — extra sales, ROI, break-even, the verdict —
-- is worked out from these columns at read time by `src/lib/marketing.ts`.
-- Storing the answers instead would freeze them against the formula that
-- happened to exist on the day, and a later fix to the arithmetic would leave
-- old campaigns quietly disagreeing with new ones. Store what was typed;
-- derive the rest. It is the same reason the money pots are computed from
-- `orders` rather than accumulated.
-- ============================================================

create table if not exists marketing_campaigns (
  id uuid primary key default gen_random_uuid(),

  -- What it was, in the owner's words. "Fiesta free taste", "Boost ng reel".
  name text not null,

  -- 'ads' | 'promo' | 'freebie' | 'other'. Text with a check rather than an
  -- enum, so adding a kind later is one migration and not a type rewrite —
  -- the same choice 0042 made for the money pots.
  kind text not null default 'ads',

  started_on date not null default current_date,
  -- Trading days it ran. Not derived from a date range: a campaign that ran
  -- over a week the shop closed for two days lasted five trading days, and
  -- every per-day figure depends on getting that right.
  days integer not null default 1,

  -- Cash actually paid out.
  spend numeric(12, 2) not null default 0,
  -- What the giveaways cost the shop to make — ingredients, not menu price.
  -- A ₱90 bowl given away costs the shop its cost, not its price, and
  -- charging the campaign ₱90 would condemn every giveaway before it starts.
  giveaway_cost numeric(12, 2) not null default 0,
  -- Money taken off the price, in total. Costs no cash and every peso of it
  -- is real, which is why it is its own column and not folded into spend.
  discount_given numeric(12, 2) not null default 0,

  -- The baseline: what a normal day took before any of this. The single most
  -- important number in the table, and the one a shop judging its own
  -- marketing by memory always overstates in its own favour.
  baseline_per_day numeric(12, 2) not null default 0,
  -- What a day took while it ran. NULL means it hasn't run yet — the row is
  -- then a plan, and the screen shows it a target instead of a verdict.
  during_per_day numeric(12, 2),

  -- The margin used to judge it, frozen at the time of writing for exactly
  -- the reason `orders.cogs` is frozen at the time of sale: a campaign judged
  -- last March should keep being judged against last March's margin, not
  -- rewritten every time an ingredient price changes.
  margin_ratio numeric(6, 4) not null default 0,

  -- Optional, and worth having for a giveaway: a free taste usually loses
  -- money on the day and earns it back on the second visit.
  new_customers integer not null default 0,
  returned integer not null default 0,

  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_campaigns_kind_known'
  ) then
    alter table marketing_campaigns
      add constraint marketing_campaigns_kind_known
      check (kind in ('ads', 'promo', 'freebie', 'other'));
  end if;

  -- A campaign lasts at least one day and a margin is a fraction. Both are
  -- enforced here as well as in the form, because the form is one way in.
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_campaigns_days_positive'
  ) then
    alter table marketing_campaigns
      add constraint marketing_campaigns_days_positive check (days >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'marketing_campaigns_margin_fraction'
  ) then
    alter table marketing_campaigns
      add constraint marketing_campaigns_margin_fraction
      check (margin_ratio >= 0 and margin_ratio <= 1);
  end if;

  -- Nobody can come back who never came in the first place.
  if not exists (
    select 1 from pg_constraint where conname = 'marketing_campaigns_returned_fits'
  ) then
    alter table marketing_campaigns
      add constraint marketing_campaigns_returned_fits
      check (returned >= 0 and new_customers >= 0 and returned <= new_customers);
  end if;
end $$;

comment on table marketing_campaigns is
  'The shop''s record of what it spent to bring people in, and whether it worked. Touches no money: nothing here moves a peso in cash_ledger or orders.';
comment on column marketing_campaigns.baseline_per_day is
  'What a normal day took before the campaign. Everything is measured against this — a campaign is only what happened ON TOP of the usual.';
comment on column marketing_campaigns.during_per_day is
  'What a day took while it ran. NULL means not run yet, and the screen shows a target rather than a verdict.';
comment on column marketing_campaigns.margin_ratio is
  'The margin this campaign was judged at, frozen the way orders.cogs is frozen — so a later ingredient price change never rewrites an old verdict.';

-- The list is read newest first and nothing else. One index, and it is the
-- one the only query uses.
create index if not exists idx_marketing_campaigns_started
  on marketing_campaigns(started_on desc);

-- ============================================================
-- Who can see what
--
-- Owner and manager, and nobody else — not because the figures are secret
-- from the shift, but because this is the shop's advertising budget and its
-- results, which is the same class of thing as the margins. There is no
-- public read at all: unlike `announcements`, none of this is meant for a
-- customer, so the safe default is that a browser session sees nothing.
-- ============================================================
alter table marketing_campaigns enable row level security;

drop policy if exists "manager_read_campaigns" on marketing_campaigns;
create policy "manager_read_campaigns" on marketing_campaigns
  for select using (is_manager());

drop policy if exists "manager_write_campaigns" on marketing_campaigns;
create policy "manager_write_campaigns" on marketing_campaigns
  for all using (is_manager()) with check (is_manager());

-- `updated_at` set by the database rather than by whichever screen happens to
-- be saving — a timestamp only one code path remembers to write is one that
-- lies the first time a second code path appears. Same reason 0025 does it.
create or replace function touch_marketing_campaign()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists marketing_campaigns_touch on marketing_campaigns;
create trigger marketing_campaigns_touch
  before update on marketing_campaigns
  for each row execute function touch_marketing_campaign();
