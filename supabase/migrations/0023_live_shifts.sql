-- ============================================================
-- Who is on shift, without anybody refreshing
--
-- The clock in the sidebar and the "On shift" badge on the Staff screen are
-- both rendered on the server, so they were only ever as current as the last
-- page load. Two consequences, and the second one is the reason this exists:
--
--   The owner looking at the Staff screen sees who was clocked in whenever
--   they opened it, which during a service is a screen quietly telling them
--   something that stopped being true an hour ago.
--
--   And the counter tablet is left open on one page all day. Somebody clocks
--   in on the phone in the back, and the tablet goes on offering "Clock in"
--   — so they press it, and the database has to refuse a second open shift.
--
-- `orders` and the chat tables already stream. This adds the third table
-- anyone actually watches.
-- ============================================================

do $$
begin
  -- Postgres has no "add table if not a member", hence the guard. Same shape
  -- as 0004, deliberately: a re-run has to be a no-op.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_shifts'
  ) then
    alter publication supabase_realtime add table staff_shifts;
  end if;
end
$$;

-- Clocking out is an UPDATE that sets `ended_at`, and the interesting part is
-- what the row USED to be — a payload with no old row cannot tell "a shift
-- ended" from "a note was edited". Full replica identity is what puts the old
-- row in the payload.
alter table staff_shifts replica identity full;

-- ============================================================
-- A note on what this does NOT do
--
-- Realtime respects RLS, and 0021 narrowed `staff_shifts` reads to "your own
-- row, or the owner". So a member of staff receives events for their own
-- shift and nobody else's, which is exactly right: their sidebar clock stays
-- honest across their own devices, and they still cannot watch the roster.
-- The owner receives all of them, which is what the Staff screen needs.
--
-- Nothing here widens that. The subscription is a signal to re-render, never
-- a source of data — the app re-reads through the same policies afterwards.
-- ============================================================
