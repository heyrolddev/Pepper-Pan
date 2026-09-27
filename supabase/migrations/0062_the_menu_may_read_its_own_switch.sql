-- ============================================================
-- 0062 — the customer's menu may read its own switch
--
-- THE BUG
--
-- Every ingredient filled in. Every one of 55 dishes complete. The owner's
-- Menu tab showing "Calories on the menu · ✓ Showing". And not one figure
-- on the customer's menu — not on the grouped cards, not on the single
-- ones, not anywhere.
--
-- `settings` has had exactly one policy since 0001:
--
--   create policy "staff_all_settings" on settings for all using (is_staff())
--
-- No public read. So `select show_nutrition from settings` returns NO ROW
-- for anybody who is not staff, `showNutrition` falls to false, and the
-- whole feature is invisible to every customer while working perfectly for
-- the owner testing it. Measured, not guessed: a signed-in customer sees 0
-- rows; postgres sees 1.
--
-- Every other settings-ish table got a public read policy on the day it was
-- added — delivery_settings (0005), payment_settings (0006), chat_settings
-- (0011), shop_settings (0013). This one never did, because until 0055 it
-- held nothing a customer needed.
--
-- WHY NOT JUST ADD `for select using (true)`
--
-- Because `settings` is where the shop's money lives. cash_reserve,
-- cash_balance_starting_amount, gcash_balance_starting_amount,
-- bank_balance_starting_amount, offsite_backup_email, logged_by_names —
-- the takings, the float in three pots, the owner's backup address and the
-- staff's names. A blanket read policy to let a customer see a calorie
-- count would hand all of that to anyone who opened the network tab.
--
-- So: a view holding the one column, and nothing else. RLS is evaluated as
-- the view's owner rather than the caller (Postgres's default for a view —
-- `security_invoker` off), which is exactly the escape hatch this needs:
-- the flag comes through, the table stays shut. Proved both ways in
-- scripts/migration-check.
-- ============================================================

create or replace view public_settings as
  select show_nutrition
    from settings
   where id = 1;

comment on view public_settings is
  'The settings a CUSTOMER may see. One column today and it should stay '
  'that way: `settings` holds the shop''s cash, its float in three pots, '
  'the backup email and the staff''s names, so anything added here is '
  'published to the whole internet. Read by app/menu; the owner''s screens '
  'read the table itself, which stays staff-only.';

-- The table's own grants are untouched: RLS still refuses it to anyone but
-- staff, and this view is the only way through.
grant select on public_settings to anon, authenticated;
