-- Pepper Pan — which migrations still need running?
--
-- Paste this whole file into the Supabase SQL Editor and run it. Every row
-- that comes back names a file in supabase/migrations/ that hasn't been
-- applied yet. No rows means the database is up to date.
--
-- Run the files it names in number order. They're all safe to run twice —
-- every statement checks whether its table, column, constraint or policy
-- already exists — so when in doubt, re-run rather than guess.

with expected(migration, kind, name) as (values
  ('0004','column','orders.eta_minutes'),
  ('0004','column','orders.cancelled_reason'),
  ('0005','column','orders.delivery_address'),
  ('0005','column','orders.delivery_fee'),
  ('0005','column','profiles.address_lat'),
  ('0006','table','payment_settings'),
  ('0006','column','orders.payment_status'),
  ('0006','column','orders.payment_receipt_url'),
  ('0007','column','orders.payment_plan'),
  ('0007','column','orders.downpayment_amount'),
  ('0008','column','orders.downpayment_confirmed_at'),
  ('0009','table','reviews'),
  ('0010','column','orders.eta_set_at'),
  ('0011','table','chat_threads'),
  ('0011','table','chat_settings'),
  ('0012','table','faq_entries'),
  ('0012','column','chat_threads.taken_over'),
  ('0013','table','shop_hours'),
  ('0013','table','shop_settings'),
  ('0013','column','orders.scheduled_for'),
  ('0014','table','push_subscriptions')
)
select migration as "run this file", kind, name as "missing"
from expected e
where (kind = 'table' and to_regclass('public.' || name) is null)
   or (kind = 'column' and not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = split_part(e.name, '.', 1)
          and c.column_name = split_part(e.name, '.', 2)))
order by 1, 3;
