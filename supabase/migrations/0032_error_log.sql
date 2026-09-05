-- ============================================================
-- 0032 — Somebody finds out when the site breaks
--
-- Until now, nothing did. If a page threw for a customer at seven on a Friday
-- evening, the only path from that to the owner knowing was the customer
-- caring enough to say so — and most people just close the tab and eat
-- somewhere else. The shop's own view of its reliability was a guess.
--
-- WHY A TABLE AND NOT A SERVICE
--
-- Sentry and its cousins are better tools than this: real stack grouping,
-- source maps, alerting, release tracking. Every one of them also needs an
-- account, a key in the environment, and a plan that eventually asks for a
-- card — and this shop is built on a standing rule of no keys and no billing.
-- Postgres is already here, already backed up, and already the thing the
-- owner looks at every day.
--
-- So this is deliberately the smaller thing: it answers "is something
-- broken, where, how often, and since when", which is the question that was
-- going unanswered. It does not replace a real APM and does not pretend to.
--
-- GROUPED, NOT LISTED
--
-- The single most important column here is `fingerprint`. One broken page hit
-- by fifty customers is one row with `times = 50`, not fifty rows — without
-- that, the first real outage writes tens of thousands of rows, the table
-- becomes the outage, and the screen showing it becomes unreadable at exactly
-- the moment it matters most.
-- ============================================================

create table if not exists error_log (
  id text primary key default gen_random_uuid()::text,
  -- What makes two errors "the same error": the message and where it
  -- happened. Unique, so recording an error is an upsert that bumps a
  -- counter rather than an insert that grows a pile.
  fingerprint text not null unique,
  message text not null,
  -- The route as the owner would name it — '/menu', '/admin/money'.
  route text,
  -- 'server' for a render or a route handler, 'action' for a server action,
  -- 'client' for something that broke in the browser.
  kind text not null default 'server',
  -- Next's own error digest, which is the only handle on an error React has
  -- already reprocessed.
  digest text,
  -- Truncated on the way in. A stack is for finding the line, not for
  -- archiving, and full stacks are most of the size of a row.
  stack text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  times int not null default 1,
  -- Ticked off by the owner once dealt with. Kept rather than deleted, so a
  -- fault that comes back is visibly a fault that came back.
  resolved boolean not null default false,
  resolved_at timestamptz
);

create index if not exists idx_error_log_last_seen on error_log(last_seen desc);
create index if not exists idx_error_log_open on error_log(resolved, last_seen desc);

alter table error_log enable row level security;

-- Read and managed by the owner alone. An error message can carry a fragment
-- of whatever it was handling, so this is not something staff — or anyone
-- signed in — should be able to page through.
drop policy if exists "owner_manage_error_log" on error_log;
create policy "owner_manage_error_log" on error_log
  for all using (is_owner()) with check (is_owner());

-- Recording an error must never fail because of a race between two requests
-- hitting the same fault at the same instant. One statement, no read-modify-
-- write, no chance of a duplicate-key error taking down the error handler
-- itself — which would be a particularly bleak way to lose an outage.
create or replace function record_error(
  p_fingerprint text,
  p_message text,
  p_route text,
  p_kind text,
  p_digest text,
  p_stack text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into error_log (fingerprint, message, route, kind, digest, stack)
  values (p_fingerprint, p_message, p_route, p_kind, p_digest, p_stack)
  on conflict (fingerprint) do update
    set times = error_log.times + 1,
        last_seen = now(),
        -- A fault that recurs after being ticked off is open again. Silently
        -- staying resolved is how a known bug becomes an invisible one.
        resolved = false,
        resolved_at = null,
        -- Refreshed, because the newest occurrence is the one worth reading.
        stack = coalesce(excluded.stack, error_log.stack),
        digest = coalesce(excluded.digest, error_log.digest);

  -- A hard ceiling, for the one case grouping does not cover: a message that
  -- embeds something unbounded — a customer's own text, a timestamp the
  -- fingerprint cannot flatten — makes every occurrence a new row. Grouping
  -- keeps this table at dozens of rows in normal life; this keeps it at
  -- hundreds in the worst one, so a runaway fault cannot quietly become a
  -- storage problem on top of being a fault.
  --
  -- Oldest-last-seen first, and resolved rows go before open ones, so what
  -- survives is what still needs attention.
  delete from error_log
  where id in (
    select id from error_log
    order by resolved asc, last_seen desc
    offset 500
  );
$$;

revoke all on function record_error(text, text, text, text, text, text) from public;
