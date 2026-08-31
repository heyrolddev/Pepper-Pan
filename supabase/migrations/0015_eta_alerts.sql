-- The kitchen timer, and one alert per order.
--
-- When the shop promises "ready in 20 minutes" and those twenty minutes run
-- out, somebody should look at the wok. The owner is cooking, not watching a
-- countdown, so the countdown has to reach them.
--
-- This column is the claim: the alert is only sent by whoever sets it first.
-- HQ can be open on a counter tablet and a phone at the same time, and both
-- would hit zero in the same second — without a claim the owner gets buzzed
-- twice for one order, which is how people learn to ignore the buzzing.
--
-- Nullable and defaulted to null, so every existing order is simply "not
-- alerted yet" and nothing has to be backfilled.

alter table orders
  add column if not exists eta_alerted_at timestamptz;

comment on column orders.eta_alerted_at is
  'When the shop was told this order''s ETA had run out. Claimed before the alert is sent, so two open HQ tabs cannot alert twice. Cleared whenever a new ETA is set.';

-- Finding the orders whose time is up is a "still cooking, has an ETA, not yet
-- alerted" question, and it is asked on every HQ page load.
create index if not exists idx_orders_eta_pending
  on orders (eta_set_at)
  where eta_alerted_at is null and eta_minutes is not null;
