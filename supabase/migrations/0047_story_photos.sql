-- ============================================================
-- 0047 — The Our story photographs
--
-- WHY THIS IS AN ANNOUNCEMENT AND NOT A TABLE
--
-- 0026 made this call once already, for the gold band and the coming-soon
-- line, and the reasoning holds exactly as well here: a story photo is a
-- thing the shop puts on its own homepage, with a picture, a caption, an
-- on/off switch and a position among its siblings. Every one of those already
-- exists on `announcements` — along with the upload, the editor, the row
-- policy, the scheduling and the activity logging.
--
-- A table of its own would have re-created all of it to hold one image URL
-- and one line of text, and would then have drifted: the day the upload rules
-- change, one of the two gets the fix.
--
-- WHAT IS DIFFERENT ABOUT IT, AND WHERE THAT LIVES
--
-- `title` is not a headline here. It is what a screen reader says about the
-- photograph, and it is the only part of a picture that cannot be worked out
-- by looking at it. The editor labels it accordingly; nothing in the database
-- needs to know.
--
-- The homepage shows the image and never the words, so a story row with no
-- picture is nothing at all. Filtered out where the homepage reads, not
-- constrained here — `image_url` is nullable for the other four kinds and a
-- per-kind NOT NULL would be a check constraint that fires while somebody is
-- half way through filling the form in.
-- ============================================================

alter table announcements drop constraint if exists announcements_kind_check;
alter table announcements add constraint announcements_kind_check
  check (kind in ('promo', 'news', 'dine_in', 'coming_soon', 'story'));

comment on column announcements.kind is
  'promo (scrolling strip + card), news (dated, own page), dine_in and coming_soon (the gold band), story (a photograph in the Our story deck, where title is the alt text).';
