-- ============================================================
-- Photos and video on announcements, two more editable sections,
-- and the homepage FAQ moved out of the source code
-- ============================================================

-- ------------------------------------------------------------
-- Media
--
-- One column each rather than a polymorphic "media_url + media_type" pair:
-- a photo and a video are laid out differently everywhere they appear — a
-- video needs muting, looping and a poster frame, a photo needs none of it —
-- so the code has to branch anyway. Two nullable columns make that branch a
-- null check instead of a string comparison that can be spelled wrong.
--
-- The files live in the shop's existing public storage bucket. Uploads go
-- through the service role in a server action, so nothing here has to open
-- storage up to browsers.
-- ------------------------------------------------------------
alter table announcements add column if not exists image_url text;
alter table announcements add column if not exists video_url text;

-- ------------------------------------------------------------
-- Two more things the shop can write for itself
--
--   dine_in      — the gold band. "Free coffee when you dine in."
--   coming_soon  — the line under it. "Chicken Wings & Chicken Pops."
--
-- Both were hardcoded in the homepage. They are the same shape as a promo —
-- a line of copy with a window it applies in — so they join the same table
-- rather than getting one of their own. That means scheduling, on/off, the
-- editor and the row policy all already work for them, and a coming-soon that
-- has arrived takes itself down on its end date like anything else.
-- ------------------------------------------------------------
alter table announcements drop constraint if exists announcements_kind_check;
alter table announcements add constraint announcements_kind_check
  check (kind in ('promo', 'news', 'dine_in', 'coming_soon'));

/* Seed the band with exactly what the homepage has been saying, so nothing
   changes the moment this ships and the owner edits real copy rather than
   facing two empty boxes. */
insert into announcements (kind, title, body, sort_order)
select 'dine_in', 'Free coffee when you dine in ☕', null, 0
where not exists (select 1 from announcements where kind = 'dine_in');

insert into announcements (kind, title, body, sort_order)
select 'coming_soon', 'Chicken Wings & Chicken Pops 🔥', null, 0
where not exists (select 1 from announcements where kind = 'coming_soon');

-- ============================================================
-- The homepage FAQ, folded into the answers that already exist
--
-- There were two lists of questions and answers: this table, which Ask Pepper
-- Pan reads, and five hardcoded items in the homepage source. Same questions,
-- different words, no way to keep them in step — and the one in the source
-- could only be changed by a deploy.
--
-- Rather than add a third place to write an answer, the homepage now reads
-- the rows flagged here. One answer, given by the chatbot AND shown on the
-- page. Correcting it once corrects it everywhere, which is the whole reason
-- this table was created in the first place.
-- ============================================================
alter table faq_entries add column if not exists show_on_site boolean not null default false;
alter table faq_entries add column if not exists site_order int not null default 0;

create index if not exists idx_faq_on_site
  on faq_entries (show_on_site, site_order) where show_on_site;

/* The five the homepage has been showing. Written as the shop's own answers
   so Ask Pepper Pan starts giving them too — it could not, before. */
insert into faq_entries (question, answer, triggers, is_active, show_on_site, site_order)
select v.q, v.a, v.t, true, true, v.n
from (values
  ('How do I place an order?',
   'Browse the menu, add what you want to your cart, and check out. You can pick it up at the stall or have it delivered.',
   array['order','how to order','place order','paano umorder'], 10),
  ('What payment methods do you accept?',
   'Cash on pickup or delivery, and GCash. Send the GCash reference after paying and we''ll confirm it.',
   array['payment','gcash','cash','bayad','magkano bayad'], 20),
  ('Do you offer delivery?',
   'Yes, around Apalit. The fee depends on how far you are — you''ll see it at checkout before you confirm.',
   array['delivery','deliver','hatid','padala'], 30),
  ('Can I customize my order?',
   'Leave a note at checkout and we''ll do what we can — extra sauce, no egg, that sort of thing.',
   array['customize','special request','extra','walang'], 40),
  ('Do I need to create an account?',
   'Yes, but it is quick: an email address and a password. It is what lets you track your order and reorder in one tap.',
   array['account','sign up','register','kailangan ba account'], 50)
) as v(q, a, t, n)
where not exists (select 1 from faq_entries where show_on_site);

-- ============================================================
-- Who may write an answer
--
-- 0012 granted this to `is_staff()`, which is every person who works the
-- counter. These answers are the shop speaking to customers in public and,
-- since this migration, they are also printed on the homepage — that belongs
-- with the people who answer for it, the same as promos do.
-- ============================================================
drop policy if exists "staff_insert_faq" on faq_entries;
drop policy if exists "staff_update_faq" on faq_entries;
drop policy if exists "staff_delete_faq" on faq_entries;

drop policy if exists "manager_write_faq" on faq_entries;
create policy "manager_write_faq" on faq_entries
  for all using (is_manager()) with check (is_manager());

/* Reading is unchanged in intent, restated because the old one let any staff
   member see drafts and this keeps that — a draft answer is not a secret,
   and the inbox screen shows them while replying. */
drop policy if exists "public_read_faq" on faq_entries;
create policy "public_read_faq" on faq_entries
  for select using (is_active or is_staff());

-- Explicit, rather than inherited from whatever the defaults happen to be.
revoke all on faq_entries from anon, authenticated;
grant select on faq_entries to anon, authenticated;
-- No sequence grant: this table's id is a uuid with a default, not a serial.
grant insert, update, delete on faq_entries to authenticated;
