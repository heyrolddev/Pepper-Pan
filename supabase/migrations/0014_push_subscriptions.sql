-- Push notifications: the first channel that reaches anyone with the tab shut.
--
-- Until now the shop could only tell you something while you were looking at
-- it. The owner had to keep the Orders tab open to learn an order had come in,
-- and a customer who closed the page had no way of hearing that their food was
-- ready. Email exists but needs a paid key, so in practice nothing reached
-- anybody.
--
-- A Web Push subscription is a per-browser, per-device handle the browser
-- itself issues. It is not an address you can guess or send to twice: the
-- endpoint is the identity, so a device that resubscribes replaces its own row
-- rather than accumulating duplicates that would ring the same phone twice.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The browser's own URL for this device. Unique because it *is* the device:
  -- re-granting permission on the same browser must update, never duplicate.
  endpoint text not null unique,

  -- The keys the payload is encrypted against. Useless without the endpoint,
  -- and they let nobody read anything — they only let us write to this device.
  p256dh text not null,
  auth text not null,

  -- So the owner can tell "my phone" from "the counter tablet" when turning
  -- one off.
  label text,

  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- A subscription belongs to exactly one person, and only that person may see
-- or remove it. Staff get no blanket read: knowing which devices a customer
-- carries is not something running a food stall requires.
--
-- Sending happens under the service role, which bypasses RLS entirely — so
-- these policies can stay this tight without breaking delivery.

drop policy if exists "read own push subscriptions" on push_subscriptions;
create policy "read own push subscriptions"
  on push_subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "create own push subscriptions" on push_subscriptions;
create policy "create own push subscriptions"
  on push_subscriptions for insert
  with check (user_id = auth.uid());

drop policy if exists "update own push subscriptions" on push_subscriptions;
create policy "update own push subscriptions"
  on push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete own push subscriptions" on push_subscriptions;
create policy "delete own push subscriptions"
  on push_subscriptions for delete
  using (user_id = auth.uid());

-- Which order steps this customer has already been told about, so a retry or
-- a double status change can't ring the same phone twice.
--
-- `notified_status` (migration 0013) already claims the step for email. Push
-- rides the same claim rather than adding a second one: one step, one claim,
-- both channels — otherwise a mail failure would suppress the push, or a
-- customer with both would get told twice.
