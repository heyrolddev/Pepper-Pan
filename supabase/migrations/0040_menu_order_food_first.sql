-- Pepper Pan — the menu opens on food, not on soft drinks
-- Run this once in the Supabase SQL Editor, after 0039.
--
-- WHAT WAS WRONG
--
-- `menu_categories.sort_order` decides the filter row on the customer's menu
-- and — since the change that ships with this migration — the order of the
-- dishes themselves under "All". The only thing that had ever written it was
-- migration 0022, which seeded it by how many dishes were in each category.
--
-- That is a reasonable first guess and a bad permanent answer. The biggest
-- category was Drinks, so a shop that sells Taiwan-style black pepper noodles
-- opened on three two-litre bottles of Coke and Sprite. The first screenful
-- of a menu is the shop saying what it is, and it was saying "soft drinks".
--
-- WHY "DRINKS" GOES LAST, NOT AT THE HEAD OF THE DRINKS
--
-- A dish sits in the earliest block any of its categories names. Most drinks
-- carry two tags — "Drinks" and "Milktea", "Drinks" and "Soft drinks" — so a
-- "Drinks" placed anywhere before them would swallow the lot into one early
-- block, and the Coffee → Milktea → Raspberry → Soft drinks sequence the shop
-- asked for would never appear. Put last, it stops competing: each drink is
-- filed under the specific thing it is, and a dish tagged only "Drinks" still
-- lands at the end, which is where it belongs anyway.
--
-- This is a starting order, not a fixed one. HQ → Menu → Categories → Reorder
-- moves any of them, which is the control this table never had.

-- ============================================================
-- The ordering, as a function rather than a one-shot UPDATE.
--
-- Three things that buys: the shop can re-run it after a bulk import without
-- calling anyone; the harness can test the real statement instead of a copy
-- of it pasted into a check; and the default list is written down in one
-- place that can be read back later to see what "food first" meant here.
-- ============================================================
create or replace function order_menu_categories(
  p_wanted text[] default array[
    -- The shop's own answer, in the shop's own words. "Noodles" and "Mains"
    -- are both listed because the noodles live under whichever of the two
    -- this menu actually uses; the one that doesn't exist is skipped.
    'Noodles', 'Mains', 'Ji Pai', 'Solo', 'Burger', 'Premium Sides',
    'Coffee', 'Milktea', 'Raspberry', 'Soft drinks', 'Drinks'
  ]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  moved int;
begin
  -- Matched case-insensitively and ignoring spacing, so "Ji Pai", "Ji pai"
  -- and "JiPai" are the same category. These names were typed in by hand over
  -- months; expecting them to match a hardcoded list exactly is how a data
  -- migration quietly does nothing and reports success.
  with matched as (
    select
      c.name,
      c.sort_order,
      (
        select i
        from unnest(p_wanted) with ordinality as w(label, i)
        where lower(replace(w.label, ' ', '')) = lower(replace(c.name, ' ', ''))
        limit 1
      ) as named
    from menu_categories c
  ),
  ranked as (
    select
      name,
      case
        when named is not null then named
        else
          -- Anything not named above keeps its existing place, after the ones
          -- that were. Adding a category later must not silently reshuffle
          -- the rest of the menu.
          --
          -- `partition by` is what makes re-running this a no-op. Numbering
          -- the unnamed rows across the whole table instead counts the named
          -- ones too, so their positions shift every run as the named rows
          -- move around them — the numbers churn forever and each run
          -- reports work it did not need to do.
          coalesce(array_length(p_wanted, 1), 0)
            + row_number() over (
                partition by (named is null) order by sort_order, name
              )
      end as position
    from matched
  )
  update menu_categories c
     set sort_order = (r.position * 10)::int
    from ranked r
   where c.name = r.name
     and c.sort_order is distinct from (r.position * 10)::int;

  get diagnostics moved = row_count;
  return moved;
end $$;

comment on function order_menu_categories(text[]) is
  'Renumber menu_categories.sort_order to a named order, food first. Names match case- and space-insensitively; anything unnamed keeps its relative place at the end. Safe to re-run.';

-- Not the public's to call: it rewrites what every customer sees first.
revoke all on function order_menu_categories(text[]) from public, anon, authenticated;

do $$
declare moved int;
begin
  select order_menu_categories() into moved;
  raise notice 'menu order set, % categories moved', moved;
end $$;
