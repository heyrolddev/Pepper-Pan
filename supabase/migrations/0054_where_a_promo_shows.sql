-- ============================================================
-- Where a promo shows
--
-- A promo has two places it can appear on the homepage: the red strip that
-- scrolls across the top, and a card further down. Until now the shop could
-- only really choose one of them:
--
--   * the strip took EVERY live promo, with no way to keep one out of it;
--   * the card was gated on `pinned`, a star whose tooltip said "hold this at
--     the front" when what it actually did was decide whether the promo got a
--     card at all.
--
-- So "put this one on a card but keep it out of the strip" could not be said,
-- and the thing that came closest was a control labelled as something else.
-- This makes the choice explicit and nameable: strip, homepage card, or both.
--
-- `pinned` is left alone. News, dine-in and coming-soon still use it for what
-- it was always for — picking which of too many gets the one slot — and
-- rewriting a column three other kinds depend on, to fix the one kind that
-- had outgrown it, is how you break the other three.
-- ============================================================

alter table announcements
  add column if not exists placement text not null default 'both';

-- Spelled out rather than left as free text: these three strings are read by
-- the homepage, the strip and the editor, and a typo in an update would
-- silently drop a promo off the page it was supposed to be on.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'announcements_placement_check'
  ) then
    alter table announcements
      add constraint announcements_placement_check
      check (placement in ('both', 'strip', 'home'));
  end if;
end $$;

-- ============================================================
-- Nothing moves on the day this runs
--
-- Every existing promo is given the placement that describes what it was
-- already doing, rather than the column default. A starred promo was in the
-- strip AND had a card, so it is 'both'; an unstarred one was in the strip
-- only. Defaulting them all to 'both' would have put every promo the shop had
-- ever written onto the homepage the moment this migration ran.
--
-- Guarded on the default so a re-run cannot overwrite a real choice made
-- since: only rows still sitting at 'both' are considered, and a promo the
-- owner has since set to 'both' deliberately would be set to 'both' again.
-- ============================================================
update announcements
set placement = case when pinned then 'both' else 'strip' end
where kind = 'promo' and placement = 'both';

-- Only promos live in the strip, so for every other kind the column has no
-- meaning and 'both' is the honest value: they show wherever their own rules
-- put them. Stated here so the intent is not mistaken for an oversight.
comment on column announcements.placement is
  'promo only: both | strip | home. Ignored for other kinds.';
