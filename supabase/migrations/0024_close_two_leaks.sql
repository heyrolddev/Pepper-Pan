-- ============================================================
-- Three holes left open by 0021, found by auditing rather than by reading
--
-- 0021 took ingredient costs, the cash ledger and the margin away from staff.
-- All three of these went around it — not through a bug in those policies,
-- but by being places nobody thought to look: a second copy of the same
-- facts, and two tables that 0021 simply never listed.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The audit log narrates every cost in plain text
--
-- `activity_log` was readable by anyone who works here. It also contains
-- lines like:
--
--     Restocked "Chicken thigh" — 5000 g for ₱1,150 (₱0.2300/g)
--     Made 2× "Sweet chili sauce" — 2000 ml, cost ₱184.00
--     Waste: 300 g of "Pork belly" — ₱96.00 (spoiled)
--
-- So `ingredients.cost` was locked away and then read out loud beside it.
-- Blocking a column and leaving a sentence that quotes the column is not
-- half a fix; it is no fix, and it is the more convincing of the two because
-- the table looks protected.
--
-- Reading moves to manager and above — a manager already sees costs, so this
-- adds nothing they didn't have. WRITING stays with everyone who works here:
-- the log's whole job is to record what people did, and a log that only
-- records the owner's actions is not an audit log.
-- ------------------------------------------------------------
-- Every name this table's policies have ever had. RLS policies are permissive
-- and OR together, so a new one only ever ADDS access — leaving the old
-- `staff_select_activity_log` in place would mean this migration appeared to
-- lock the log while changing nothing at all. Caught by probing as a staff
-- member after applying it, which is the only way that shows.
drop policy if exists "staff_all_activity_log" on activity_log;
drop policy if exists "staff_insert_activity_log" on activity_log;
drop policy if exists "staff_select_activity_log" on activity_log;
drop policy if exists "insert_activity_log" on activity_log;
drop policy if exists "read_activity_log" on activity_log;

create policy "insert_activity_log" on activity_log
  for insert with check (is_staff());
create policy "read_activity_log" on activity_log
  for select using (is_manager());

-- No UPDATE and no DELETE policy, deliberately, and that is unchanged from
-- 0016: a log anybody can edit afterwards is not evidence of anything.

-- ------------------------------------------------------------
-- 2. Any staff member could change where customers are sent to chat
--
-- `chat_settings` holds `messenger_url` and `page_id` — the Facebook page the
-- "Ask Pepper Pan" button opens. It was UPDATE-able by `is_staff()`, and the
-- action that writes it had no check of its own either, so it leaned entirely
-- on that policy.
--
-- Pointing the shop's customers at a different Messenger page is not a shift's
-- decision. It is the same kind of change as the GCash number, and it belongs
-- with the owner for the same reason.
-- ------------------------------------------------------------
drop policy if exists "staff_write_chat_settings" on chat_settings;
drop policy if exists "owner_write_chat_settings" on chat_settings;
create policy "owner_write_chat_settings" on chat_settings
  for update using (is_owner()) with check (is_owner());

-- Reading stays public: the shop front needs the Messenger link to render the
-- button, and the link is public information the moment it does.


-- ------------------------------------------------------------
-- 3. The shop's own costs were never on 0021's list
--
-- `fixed_costs` and `assets` arrived in 0019, after the tables 0021 was
-- written against. Both carried a `staff_read_*` SELECT policy, so everyone
-- who worked here could read the rent, the electricity, the salaries and what
-- the fryer cost — which is squarely the "business numbers" this was all
-- supposed to keep off the staff screens.
--
-- The lesson is the one the backup list already taught this project: a
-- hand-written list of tables does not fail loudly when it falls behind. It
-- goes on looking complete. Anything added after a permissions migration has
-- to be checked against it, and the way to check is to probe as the role
-- rather than to read the file.
--
-- The owner-manage policies from 0019 already exist and are correct; only the
-- staff read is withdrawn. Manager keeps no access here on purpose: unlike
-- ingredient costs, the rent is not something you need in order to restock.
-- ------------------------------------------------------------
drop policy if exists "staff_read_fixed_costs" on fixed_costs;
drop policy if exists "staff_read_assets" on assets;

-- ------------------------------------------------------------
-- 4. The waste log quotes the ingredient's cost per unit
--
-- `waste_log.cost_at_time` is not a derived total — it is the ingredient's
-- unit cost, copied onto the row so a write-off is priced at what the stock
-- actually cost that day rather than at today's price. Which makes it the
-- same number as `ingredients.cost`, on a table staff must be able to read
-- and write, sitting one query away from the column 0021 locked:
--
--     select cost_at_time from waste_log where ingredient_id = '…'
--
-- Staff keep the whole table except those two columns. Same shape as the
-- margin on `orders`, and for the same reason a REVOKE alone will not do it:
-- a column-level revoke cannot carve a hole in a whole-table grant, so the
-- table grant goes and the other columns are granted back — generated, so a
-- column added later is readable by default and only the two named here stay
-- behind the wall.
--
-- Writing is untouched. Logging waste stays with everyone who works here, and
-- the app fills the cost server-side, so nobody is typing it in anyway.
--
-- One honest limitation: a column grant is held by the `authenticated` role,
-- which every signed-in person shares, so this takes the two columns from the
-- manager as well — even though a manager may see `ingredients.cost` and
-- could work the same number out. Nothing breaks (every screen that shows
-- waste cost reads it through the service role), and erring tighter is the
-- right way to err. Worth knowing rather than discovering.
-- ------------------------------------------------------------
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'waste_log'
    and column_name not in ('cost_at_time', 'total_cost');

  execute 'revoke select on waste_log from anon, authenticated';
  execute format('grant select (%s) on waste_log to anon, authenticated', cols);
end $$;
