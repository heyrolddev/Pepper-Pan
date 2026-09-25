-- ============================================================
-- Stop two categories sharing a colour
--
-- 0055 made the palette collision-free and it changed nothing on screen. The
-- reason is in `rememberCategory`: when a category is first created the app
-- writes `fallbackColour(name)` — a HASH of the name — straight into this
-- column. So every category already carries a stored colour, and the new
-- assignment deliberately never overrides a stored one, on the grounds that
-- the owner chose it.
--
-- The owner did not choose it. A hash into ten buckets did, and it collides:
-- this shop ended up with Ji Pai, Burger and Ji Wings all the same pale sand,
-- Solo and Soft drinks both orange, Milktea and Hidden both black. The fix
-- could not reach any of it, because to the code it all looked deliberate.
--
-- So the ties are broken here. A category whose colour is already taken by an
-- earlier one has it CLEARED — set to the empty string — and the app then
-- hands it the first colour nothing else is using. Cleared rather than
-- reassigned in SQL on purpose: the palette lives in src/lib/categories.ts,
-- and a second copy of it in here is a second copy to keep in step.
--
-- The first category to hold a colour keeps it. If the owner really did pick
-- one by hand it is nearly always the earlier row, and keeping the earliest
-- is the least surprising rule when the two cannot be told apart.
-- ============================================================

with ranked as (
  select
    name,
    colour,
    row_number() over (
      partition by colour
      order by sort_order, name
    ) as nth
  from menu_categories
  where colour is not null and colour <> ''
)
update menu_categories c
set colour = ''
from ranked r
where c.name = r.name and r.nth > 1;

-- ============================================================
-- And nothing new arrives pre-coloured
--
-- The app stops writing the hash (see `rememberCategory`), so a category
-- created from here on has no stored colour and is assigned one at render —
-- against every other category, which is the only place that can be known.
-- This default matches: a row inserted by hand, or by a restore from a backup
-- taken before 0055, joins the same scheme instead of landing on 'ink'
-- alongside however many others already sit there.
-- ============================================================
alter table menu_categories alter column colour set default '';

comment on column menu_categories.colour is
  'A palette token from src/lib/categories.ts. EMPTY means "not chosen" — the '
  'app assigns a colour no other category is using. Do not default this to a '
  'real token: a stored colour is treated as the owner''s own pick and is '
  'never moved to break a tie.';
