-- ============================================================
-- Choosing what the homepage shows
--
-- Two problems, one column.
--
-- THE BUG. The homepage asked for news ordered by `sort_order`, then took the
-- first three. But a new row is given `sort_order = max + 10` so that adding a
-- promo never silently reorders the strip somebody has arranged — which means
-- a newly written news post got the HIGHEST sort_order, sorted LAST, and could
-- never reach the homepage at all. The shop was showing its three OLDEST
-- notices. The code even carried a comment saying "newest first", which is
-- how it survived: it read correctly and behaved backwards.
--
-- News is now ordered by when it was written, newest first, which is what a
-- reader expects of anything called news and what the comment always claimed.
--
-- THE FEATURE. Newest-first is the right default, not the right rule. A
-- closure next week matters more than a new dish posted this morning, and the
-- shop should be able to say so. A pinned post is held at the front of its
-- own kind; everything else follows in its natural order.
--
-- Deliberately not a "show on the homepage" switch per row. That would make a
-- new post invisible until somebody remembered to tick it, which is the same
-- failure as the bug above wearing a different hat.
-- ============================================================
alter table announcements add column if not exists pinned boolean not null default false;

create index if not exists idx_announcements_pinned
  on announcements (kind, pinned, created_at desc);
