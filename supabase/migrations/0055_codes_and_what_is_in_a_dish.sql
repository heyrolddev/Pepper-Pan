-- ============================================================
-- A short name for every dish, and what is in one
--
-- Two things the menu could not say.
--
-- CODES. "One Cheesy Giant Ji Pai with extra rice" is a sentence; "C1" is a
-- code. Every fast-food counter in the country runs on the second one because
-- it survives a noisy stall, a phone order and a customer who does not know
-- how the dish is spelled. The shop already had the dish; it had no short way
-- to say it.
--
-- NUTRITION. Nothing anywhere in this database knew a calorie. The rollup is
-- built the same way costing is — per unit on the ingredient, multiplied by
-- what the recipe takes, summed through batches and combos — because that is
-- the only version that stays right when a recipe changes. A number typed on
-- the dish goes stale the first time somebody adds a slice of cheese.
--
-- The per-dish fields are still here, as an override, because there are
-- always dishes the recipe cannot answer for: a bought-in bottled drink with
-- the figures printed on the label, a dessert from a supplier.
-- ============================================================

-- ============================================================
-- The code
-- ============================================================
alter table meals add column if not exists code text;

-- Unique, case-insensitively, and only among dishes that have one. Two dishes
-- sharing a code is worse than neither having one: the counter says "C1" and
-- two different things are correct. `nulls not distinct` is deliberately NOT
-- used — any number of dishes may have no code yet.
create unique index if not exists idx_meals_code
  on meals (lower(code)) where code is not null;

-- ============================================================
-- Nutrition, per one unit of the ingredient
--
-- "Per unit" means per whatever `ingredients.unit` already says — per gram
-- for Breading, per piece for a cheese slice. Same convention as `cost`, so
-- a recipe line's qty multiplies both the same way and there is no second
-- unit to keep in step.
--
-- Nullable on purpose, and left null. A zero would be a claim — "this has no
-- calories" — and the rollup would quietly report a dish as lighter than it
-- is. Null means nobody has said yet, and a dish with a null anywhere in its
-- recipe shows no figure at all rather than a wrong one.
-- ============================================================
alter table ingredients
  add column if not exists kcal_per_unit numeric,
  add column if not exists protein_per_unit numeric,
  add column if not exists carbs_per_unit numeric,
  add column if not exists fat_per_unit numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ingredients_nutrition_not_negative'
  ) then
    alter table ingredients
      add constraint ingredients_nutrition_not_negative check (
        coalesce(kcal_per_unit, 0) >= 0
        and coalesce(protein_per_unit, 0) >= 0
        and coalesce(carbs_per_unit, 0) >= 0
        and coalesce(fat_per_unit, 0) >= 0
      );
  end if;
end $$;

-- ============================================================
-- The per-dish override
--
-- Four nullable numbers. All null — the ordinary case — means "work it out
-- from the recipe". Any of them set means the owner has overruled the recipe
-- for this dish, and the screens say so rather than showing a figure whose
-- source nobody can tell.
-- ============================================================
alter table meals
  add column if not exists kcal numeric,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'meals_nutrition_not_negative'
  ) then
    alter table meals
      add constraint meals_nutrition_not_negative check (
        coalesce(kcal, 0) >= 0
        and coalesce(protein_g, 0) >= 0
        and coalesce(carbs_g, 0) >= 0
        and coalesce(fat_g, 0) >= 0
      );
  end if;
end $$;

-- ============================================================
-- Whether customers see any of it
--
-- Default false. Everything is blank the day this runs, and a menu that
-- suddenly grows an empty "Calories" line on every card looks broken. The
-- owner turns it on once the ingredients are filled in and the numbers are
-- worth showing.
-- ============================================================
alter table settings
  add column if not exists show_nutrition boolean not null default false;

comment on column ingredients.kcal_per_unit is
  'Per ONE unit of ingredients.unit — per g, per pc. Null = not known yet.';
comment on column meals.kcal is
  'Owner override. Null = work it out from the recipe.';
