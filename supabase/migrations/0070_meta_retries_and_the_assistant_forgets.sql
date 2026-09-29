-- ============================================================
-- 0070 — Meta retries, and the assistant was stuck on hello
--
-- TWO THINGS FOUND IN THE MESSENGER WEBHOOK
--
-- ── 1. A retry answered the customer twice ─────────────────────────
--
-- Meta re-sends any delivery it does not get a prompt 200 for, and the
-- webhook does its whole job BEFORE acknowledging: it writes the
-- customer's message, works out a reply, writes that, updates the
-- thread, and posts the answer back to Meta's Graph API with an eight
-- second timeout of its own. Four round trips to the database and one
-- to Facebook, and only then a 200. One slow Graph call or one cold
-- start and Meta sends the same message again.
--
-- Nothing stopped the second run. The customer's line landed in the
-- shop's inbox twice, the customer got two identical replies to one
-- question, and a question the assistant could not answer fired the
-- owner's push notification twice. A delivery carrying several messages
-- made that likelier, because they are handled one after another before
-- anything returns.
--
-- No wasted model bill, and that is worth being accurate about: the
-- assistant here is not a language model. It matches against the shop's
-- own FAQ and data, in process, and costs nothing per answer. What a
-- retry costs is the shop's credibility with somebody who now has two
-- replies and no idea which one to read.
--
-- Meta sends `message.mid` for exactly this reason and the webhook
-- ignored it. The fix is the one `apply_order_stock` already uses for a
-- sale: CLAIM FIRST. Inserting the id is the claim, the primary key is
-- what makes it atomic, and a retry finds the row already there and
-- stops. Two deliveries racing cannot both win, because the database
-- decides rather than the code.
--
-- ── 2. A trap in how the conversation is loaded ─────────────────────
--
-- Both the webhook and the website load history with
--
--     .order("id", { ascending: true }).limit(40)
--
-- which is the OLDEST forty messages, not the most recent.
--
-- It changes no answer today. `askAssistant` reads exactly one thing out
-- of the history it is handed — the last user turn, which the caller has
-- just appended — and discards the rest. So this is a trap, not a live
-- fault, and it is worth closing because of how it would spring: the day
-- the assistant learns to use context, every long conversation would
-- quietly be replaying its own opening, and every test would still pass.
--
-- Fixed in the code rather than here, in `lib/chat-history.ts`, where
-- the rule now lives once instead of being assumed twice.
-- ============================================================

create table if not exists messenger_events (
  /* Meta's own id for one message. The PRIMARY KEY is the whole
     mechanism: the insert either wins or conflicts, and there is no
     window between checking and claiming for a retry to slip through. */
  mid text primary key,
  /* Who it was from, so a stuck conversation can be found. */
  sender_id text,
  received_at timestamptz not null default now()
);

create index if not exists idx_messenger_events_at
  on messenger_events(received_at desc);

comment on table messenger_events is
  'One row per Messenger message already handled. Meta re-sends anything '
  'it does not get a prompt 200 for, and without this a retry put the '
  'customer''s message in the inbox twice and sent them two identical '
  'replies to one question.';

alter table messenger_events enable row level security;

/* No policies at all, deliberately. The webhook writes as the service
   role and nothing else has any business reading a log of who messaged
   the Page — the conversations themselves are already in `chat_threads`,
   behind the inbox's own rules. */

/* A page that has been running a year should not carry a year of ids.
   Called by the webhook, cheaply, so there is no cron to forget. */
create or replace function prune_messenger_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from messenger_events where received_at < now() - interval '7 days'
$$;

revoke all on function prune_messenger_events() from public, anon, authenticated;
grant execute on function prune_messenger_events() to service_role;

comment on function prune_messenger_events is
  'Drops handled-message ids older than a week. Meta gives up retrying '
  'long before that, so anything older can no longer prevent anything.';
