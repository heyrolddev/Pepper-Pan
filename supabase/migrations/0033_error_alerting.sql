-- ============================================================
-- 0033 — Tell the owner the first time something breaks
--
-- 0032 records faults and groups them. It does not tell anybody, so finding
-- out still means opening the dashboard — which is exactly the thing nobody
-- does on the evening it matters.
--
-- The signal worth sending is a fault appearing for the FIRST time. The
-- fiftieth customer hitting the same broken checkout is not fifty pieces of
-- news; it is one piece of news and a counter. A notification per occurrence
-- would, on the one night it fires, turn a phone into an alarm the owner
-- switches off — and then it is off on the next night too.
--
-- So `record_error` returns whether this was new. `xmax = 0` is the standard
-- way to tell an INSERT from an ON CONFLICT UPDATE in the same statement:
-- Postgres leaves the row's delete-transaction id at zero for a fresh insert.
-- Reading it here rather than doing a select-then-insert in the application
-- keeps the whole thing one statement, so two requests hitting the same brand
-- new fault at the same instant cannot both decide they were first.
--
-- The return type changes, so the old function has to go before the new one
-- can exist — `create or replace` cannot change a signature.
-- ============================================================

drop function if exists record_error(text, text, text, text, text, text);

create function record_error(
  p_fingerprint text,
  p_message text,
  p_route text,
  p_kind text,
  p_digest text,
  p_stack text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  is_new boolean;
begin
  insert into error_log (fingerprint, message, route, kind, digest, stack)
  values (p_fingerprint, p_message, p_route, p_kind, p_digest, p_stack)
  on conflict (fingerprint) do update
    set times = error_log.times + 1,
        last_seen = now(),
        -- A fault that recurs after being ticked off is open again. Silently
        -- staying resolved is how a known bug becomes an invisible one.
        resolved = false,
        resolved_at = null,
        stack = coalesce(excluded.stack, error_log.stack),
        digest = coalesce(excluded.digest, error_log.digest)
  returning (xmax = 0) into is_new;

  -- A hard ceiling, for the one case grouping does not cover: a message that
  -- embeds something unbounded makes every occurrence a new row. Oldest-last-
  -- seen first, and resolved rows before open ones, so what survives is what
  -- still needs attention.
  delete from error_log
  where id in (
    select id from error_log
    order by resolved asc, last_seen desc
    offset 500
  );

  return is_new;
end;
$$;

revoke all on function record_error(text, text, text, text, text, text) from public;
