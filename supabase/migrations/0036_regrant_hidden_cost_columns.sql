-- ============================================================
-- The trap in 0021, and the three columns that fell into it.
--
-- 0021 took the whole-table SELECT off `orders` for browser-side sessions and
-- granted back every column EXCEPT the four margin ones, so that a signed-in
-- customer cannot ask the REST endpoint for `orders?select=cogs`. 0024 did the
-- same to `waste_log`. That is right, and it should stay.
--
-- But 0021's own comment says this:
--
--     "Generated rather than typed out, so a column added to `orders` next
--      year is readable by default and only the four named here stay behind
--      the wall."
--
-- That is not what generating it once achieves. The list is frozen at the
-- moment it runs. A column added afterwards has NO grant at all — not hidden
-- on purpose, just never granted — and Postgres reports a missing column
-- privilege as "permission denied for TABLE orders", which reads like the
-- whole table is gone.
--
-- Which is exactly what happened. 0034 added `ticket`, 0035 added
-- `cancelled_by` and `cancelled_at`, and the Orders page — which reads with
-- the signed-in session, not the service role — started failing outright the
-- moment it asked for `ticket`.
--
-- So the regrant becomes a named function instead of a one-off DO block.
-- Idempotent, safe to run any time, and the thing to call at the end of any
-- migration that adds a column to either table. That is one line to remember
-- instead of a comment that says it happens by itself.
-- ============================================================

create or replace function regrant_visible_columns()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  spec record;
  cols text;
begin
  -- One row per table that hides money from browser-side sessions, with the
  -- columns that stay behind the wall.
  for spec in
    select 'orders'::text as tbl,
           array['cogs','oe','gross_profit','net_profit']::text[] as hidden
    union all
    select 'waste_log'::text,
           array['cost_at_time','total_cost']::text[]
  loop
    if not exists (select 1 from information_schema.tables
                   where table_schema = 'public' and table_name = spec.tbl) then
      continue;
    end if;

    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = spec.tbl
      and not (column_name = any (spec.hidden));

    -- Table grant off first, then the columns back. A column-level REVOKE
    -- cannot carve a hole in a whole-table GRANT: the two are tracked
    -- separately and the table-level privilege keeps answering yes.
    execute format('revoke select on %I from anon, authenticated', spec.tbl);
    execute format('grant select (%s) on %I to anon, authenticated', cols, spec.tbl);
  end loop;
end $$;

revoke all on function regrant_visible_columns() from public, anon, authenticated;

comment on function regrant_visible_columns is
  'Re-grant column-level SELECT on the tables that hide cost columns from browser sessions. Call this at the end of any migration that adds a column to orders or waste_log — a new column gets no grant on its own, and Postgres reports that as "permission denied for table".';

select regrant_visible_columns();
