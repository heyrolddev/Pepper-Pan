import test from "node:test";
import assert from "node:assert/strict";

import {
  blindDishNote,
  dishesWithoutRecipe,
  type Component,
  type MenuDish,
} from "../src/lib/menu-health.ts";

const dish = (id: string, name = id, isPublic = true): MenuDish => ({ id, name, isPublic });

test("a dish with its own ingredients is fine", () => {
  const out = dishesWithoutRecipe([dish("ramen")], new Set(["ramen"]), []);
  assert.deepEqual(out, []);
});

test("a dish with nothing at all is named", () => {
  const out = dishesWithoutRecipe([dish("tea", "Iced Tea")], new Set(), []);
  assert.deepEqual(out.map((d) => d.name), ["Iced Tea"]);
});

test("a combo costed through its parts is NOT named", () => {
  // The whole reason this is a tree walk. "No rows in meal_ingredients" would
  // accuse every properly built combo on the menu — which is worse than no
  // warning, because it teaches the owner to ignore the panel.
  const components: Component[] = [{ mealId: "combo", componentMealId: "inner" }];
  const out = dishesWithoutRecipe([dish("combo"), dish("inner")], new Set(["inner"]), components);
  assert.deepEqual(out, []);
});

test("a combo whose parts are also empty is named", () => {
  const components: Component[] = [{ mealId: "combo", componentMealId: "inner" }];
  const out = dishesWithoutRecipe([dish("combo")], new Set(), components);
  assert.deepEqual(out.map((d) => d.id), ["combo"]);
});

test("ingredients found several levels down still count", () => {
  const components: Component[] = [
    { mealId: "a", componentMealId: "b" },
    { mealId: "b", componentMealId: "c" },
    { mealId: "c", componentMealId: "d" },
  ];
  assert.deepEqual(dishesWithoutRecipe([dish("a")], new Set(["d"]), components), []);
});

test("a recipe that refers to itself does not hang the page", () => {
  const components: Component[] = [
    { mealId: "a", componentMealId: "b" },
    { mealId: "b", componentMealId: "a" },
  ];
  // Answers "nothing found" rather than looping — which flags the dish for a
  // human instead of quietly passing it.
  assert.deepEqual(dishesWithoutRecipe([dish("a")], new Set(), components).map((d) => d.id), ["a"]);
});

test("one blind dish among several is the only one named", () => {
  const out = dishesWithoutRecipe(
    [dish("ramen"), dish("tea", "Iced Tea"), dish("egg")],
    new Set(["ramen", "egg"]),
    []
  );
  assert.deepEqual(out.map((d) => d.id), ["tea"]);
});

test("the note counts how many are live on the menu", () => {
  const note = blindDishNote([dish("a", "A", true), dish("b", "B", false)]);
  assert.match(note, /2 dishes have no recipe/);
  assert.match(note, /1 of them are on the menu now/);
});

test("the note reads as one sentence for a single dish", () => {
  const note = blindDishNote([dish("a", "A", true)]);
  assert.match(note, /1 dish has no recipe/);
  assert.match(note, /it is on the menu now/);
  assert.match(note, /₱0 of cost/);
});

test("a hidden blind dish is still counted, just not called live", () => {
  const note = blindDishNote([dish("a", "A", false)]);
  assert.match(note, /1 dish has no recipe\./);
  assert.doesNotMatch(note, /on the menu now/);
});
