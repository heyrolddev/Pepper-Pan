-- ============================================================
-- 0052 — The shop's own answer to "what's your bestseller?"
--
-- THE BUG THIS EXISTS FOR
--
-- Ask Pepper Pan answered that question by counting `order_lines` and naming
-- whatever had the highest QUANTITY. Extra rice is ₱25 and goes on half the
-- orders in the shop; a ₱189 rice meal will never out-count it. So customers
-- asking what to try were told, confidently, that the bestseller was a cup of
-- rice. That is not a bug in the arithmetic — the arithmetic was right — it
-- is a bug in the question. "Most units shifted" and "what should I order"
-- are different things, and only one of them is worth saying to a customer.
--
-- WHY A PINNED DISH AND NOT A CLEVERER SUM
--
-- Ranking by revenue instead of quantity fixes the rice (and this migration's
-- code change does exactly that as the fallback). But it still cannot know
-- what the shop WANTS to sell: the dish with the best margin, the one they
-- are known for, the new thing that needs pushing. That is a decision, not a
-- calculation, and the owner is the only one who can make it. So the answer
-- is theirs to set, and the sum is what answers when they have not.
--
-- The dish is a reference rather than typed text on purpose — the price in
-- the reply is then read live from the menu, so a recommendation cannot go
-- stale the day prices change.
--
-- WHY THE PROMO ANSWER IS MOSTLY NOT HERE
--
-- Only a note. The promos themselves already live in `announcements`, where
-- the owner writes them for the homepage strip, and asking them to type the
-- same offer a second time for the chat is how the two end up disagreeing —
-- with the customer being told about a promo that ended last week. So the
-- assistant reads the live ones, and this column is for the standing extras
-- that are not announcements at all: the suki discount, "ask about bulk".
-- ============================================================

alter table chat_settings
  add column if not exists featured_meal_id text references meals(id) on delete set null,
  add column if not exists featured_note text,
  add column if not exists promo_note text;

comment on column chat_settings.featured_meal_id is
  'The dish Ask Pepper Pan recommends. NULL falls back to the best seller by revenue. A reference, not a name, so the price in the reply is always the live one.';
comment on column chat_settings.featured_note is
  'The owner''s own words for why. Replaces the dish description in the reply when set.';
comment on column chat_settings.promo_note is
  'Standing offers that are not announcements — the suki discount, bulk orders. Live promos come from `announcements`, so nothing has to be typed twice.';
