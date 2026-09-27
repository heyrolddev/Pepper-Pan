/**
 * Reference nutrition, so a shop does not have to look up eighty ingredients.
 *
 * `ingredients.kcal_per_unit` and its three siblings have existed since 0055
 * and every one of them is null, because filling them means finding a figure
 * for pork belly, then for cabbage, then for soy sauce, eighty times over. So
 * no dish reaches `missing === 0`, so no dish shows a calorie count, so the
 * whole feature sits there doing nothing. The blocker was never the software.
 *
 * ── What these numbers are, and what they are not ────────────────────────
 *
 * They are published composition averages for raw, unprepared foods — the
 * USDA FoodData Central figures, with the Philippine FNRI tables preferred
 * where a local item differs (patis, and the PH cut names). They are a
 * STARTING POINT, not a measurement of this shop's actual supplier: pork
 * belly at one butcher is fattier than at another, and a "medium" egg is a
 * range. Every figure stays editable, and the screen says it is an estimate.
 *
 * That honesty matters more than the precision does. A calorie count on a
 * menu is a claim made to a customer, and the difference between "about 640"
 * and "640" is the difference between a useful guide and a promise the shop
 * cannot keep.
 *
 * ── Raw, not cooked ──────────────────────────────────────────────────────
 *
 * Every figure here is for the ingredient as it is BOUGHT, because that is
 * what a recipe measures and what the shelf holds. 100 g of raw rice becomes
 * roughly 260 g of cooked rice; using the cooked figure against a recipe
 * written in raw grams would understate a rice meal by about two thirds. The
 * one exception is anything sold ready to eat, which is marked.
 */

export type Macros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

/**
 * What the figures are measured against.
 *
 * `100g` and `100ml` line up with `entryBasis` in `lib/nutrition.ts`, which
 * already asks the owner for a per-100 figure on those units. `each` is for
 * things counted rather than weighed — an egg, a slice of cheese — where the
 * same file asks per one.
 */
export type Basis = "100g" | "100ml" | "each";

export type ReferenceFood = {
  /** Stable id, so a saved choice survives a label being reworded. */
  key: string;
  label: string;
  basis: Basis;
  macros: Macros;
  /**
   * Names this food goes by on a Filipino stall's shelf, lowercase.
   *
   * Longest match wins, which is the whole reason "pork" and "pork belly" can
   * both be in here: an ingredient called "Pork Belly (liempo)" must not be
   * costed as lean shoulder just because "pork" appeared first in the list.
   */
  aka: string[];
  /** Said out loud where a figure would otherwise be surprising. */
  note?: string;
  /**
   * Energy that Atwater's three factors cannot account for.
   *
   * Protein, carbs and fat are not the only things a body gets energy from,
   * and vinegar is the one on this list that proves it: its calories come
   * from acetic acid, which is neither a carbohydrate nor a fat. Its figures
   * are right and they do not add up, so the check that guards the rest of
   * the table against typos has to be told, rather than the number being
   * quietly bent until the arithmetic is happy.
   */
  atwaterExempt?: string;
};

const g = (
  key: string,
  label: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  aka: string[],
  note?: string
): ReferenceFood => ({ key, label, basis: "100g", macros: { kcal, protein, carbs, fat }, aka, note });

const ml = (
  key: string,
  label: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  aka: string[],
  note?: string
): ReferenceFood => ({ key, label, basis: "100ml", macros: { kcal, protein, carbs, fat }, aka, note });

const each = (
  key: string,
  label: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  aka: string[],
  note?: string
): ReferenceFood => ({ key, label, basis: "each", macros: { kcal, protein, carbs, fat }, aka, note });

export const REFERENCE: ReferenceFood[] = [
  // ---- pork ----
  g("pork-belly", "Pork belly (liempo), raw", 518, 9.3, 0, 53, ["pork belly", "liempo", "samgyup", "baboy liempo"],
    "Fatty by definition — over five times the energy of lean shoulder. Worth checking against your own cut."),
  g("pork-shoulder", "Pork shoulder (kasim), raw", 180, 20.0, 0, 11.0, ["pork shoulder", "kasim", "pork kasim", "pigue", "lean pork"]),
  g("pork-ground", "Ground pork (giniling), raw", 263, 16.9, 0, 21.2, ["ground pork", "giniling na baboy", "pork giniling", "minced pork"]),
  g("pork-liempo-strips", "Pork strips, raw", 242, 17.0, 0, 19.0, ["pork strips", "pork slices", "sliced pork", "pork"]),

  // ---- chicken and beef ----
  g("chicken-breast", "Chicken breast, skinless, raw", 120, 22.5, 0, 2.6, ["chicken breast", "breast fillet", "chicken fillet", "pechuga"]),
  g("chicken-thigh", "Chicken thigh, skinless, raw", 121, 19.7, 0, 4.1, ["chicken thigh", "thigh fillet", "hita ng manok"]),
  g("chicken-whole", "Chicken with skin, raw", 215, 18.6, 0, 15.1, ["chicken", "manok", "chicken cut", "chicken parts"]),
  g("beef-lean", "Beef, lean, raw", 143, 21.0, 0, 6.0, ["beef", "baka", "ground beef", "giniling na baka"]),

  // ---- seafood and egg ----
  g("shrimp", "Shrimp (hipon), raw", 85, 20.1, 0.9, 0.5, ["shrimp", "hipon", "prawn", "sugpo"]),
  g("squid", "Squid (pusit), raw", 92, 15.6, 3.1, 1.4, ["squid", "pusit", "calamari"]),
  g("fish-fillet", "White fish fillet, raw", 96, 20.5, 0, 1.2, ["fish fillet", "cream dory", "dory", "tilapia", "bangus"]),
  each("egg", "Egg, whole, raw (about 50 g)", 72, 6.3, 0.4, 4.8, ["egg", "itlog", "whole egg", "chicken egg"],
    "Per egg, for a medium one. A jumbo egg is nearer 90 kcal."),
  g("egg-bulk", "Egg, whole, by weight", 143, 12.6, 0.7, 9.5, ["egg by weight", "liquid egg", "beaten egg"]),

  // ---- processed ----
  g("fishball", "Fishball, raw", 110, 9.0, 12.0, 3.0, ["fishball", "fish ball", "kikiam", "squid ball"],
    "Commercial products vary a lot — check the pack if it carries a panel."),
  g("hotdog", "Hotdog / sausage", 290, 11.0, 4.0, 26.0, ["hotdog", "hot dog", "sausage", "longganisa"]),
  g("bacon", "Bacon, raw", 417, 13.0, 1.3, 39.0, ["bacon"]),
  g("ham", "Ham, cooked", 145, 18.0, 1.5, 7.0, ["ham"]),
  g("tofu", "Tofu (tokwa), firm", 144, 15.8, 4.3, 8.7, ["tofu", "tokwa", "bean curd"]),

  // ---- starches ----
  g("rice-raw", "White rice, uncooked", 365, 7.1, 80.0, 0.7, ["rice", "bigas", "white rice", "jasmine rice", "uncooked rice"],
    "Raw. 100 g of this makes roughly 260 g of cooked rice — if your recipe is written in cooked grams, use the cooked entry instead."),
  g("rice-cooked", "White rice, cooked", 130, 2.7, 28.0, 0.3, ["cooked rice", "kanin", "steamed rice", "rice cooked"]),
  g("noodles-dry", "Egg noodles, dry", 384, 14.2, 71.0, 4.4, ["noodles", "pancit", "egg noodle", "miki", "canton", "dry noodles", "ramen noodles"]),
  g("noodles-cooked", "Noodles, cooked", 138, 4.5, 25.0, 2.1, ["cooked noodles", "boiled noodles"]),
  g("flour", "Wheat flour", 364, 10.3, 76.0, 1.0, ["flour", "harina", "all purpose flour", "bread flour"]),
  g("cornstarch", "Cornstarch", 381, 0.3, 91.0, 0.1, ["cornstarch", "corn starch", "gawgaw"]),
  g("breadcrumbs", "Bread crumbs", 395, 13.4, 71.9, 5.3, ["bread crumbs", "breadcrumbs", "panko"]),
  g("potato", "Potato, raw", 77, 2.0, 17.0, 0.1, ["potato", "patatas"]),
  g("sweet-potato", "Sweet potato (kamote), raw", 86, 1.6, 20.0, 0.1, ["sweet potato", "kamote"]),

  // ---- vegetables ----
  g("cabbage", "Cabbage (repolyo), raw", 25, 1.3, 5.8, 0.1, ["cabbage", "repolyo"]),
  g("onion", "Onion, raw", 40, 1.1, 9.3, 0.1, ["onion", "sibuyas", "red onion", "white onion"]),
  g("garlic", "Garlic, raw", 149, 6.4, 33.0, 0.5, ["garlic", "bawang"]),
  g("ginger", "Ginger, raw", 80, 1.8, 18.0, 0.8, ["ginger", "luya"]),
  g("carrot", "Carrot, raw", 41, 0.9, 9.6, 0.2, ["carrot", "karot"]),
  g("beansprouts", "Beansprouts (togue), raw", 30, 3.0, 5.9, 0.2, ["beansprouts", "bean sprouts", "togue", "toge", "sprouts"]),
  g("spring-onion", "Spring onion, raw", 32, 1.8, 7.3, 0.2, ["spring onion", "scallion", "green onion", "leeks", "dahon ng sibuyas"]),
  g("pechay", "Pechay / bok choy, raw", 13, 1.5, 2.2, 0.2, ["pechay", "bok choy", "pak choi", "petsay"]),
  g("bell-pepper", "Bell pepper, raw", 31, 1.0, 6.0, 0.3, ["bell pepper", "capsicum", "atsal"]),
  g("chili", "Chili (siling labuyo), raw", 40, 1.9, 8.8, 0.4, ["chili", "sili", "labuyo", "siling"]),
  g("tomato", "Tomato, raw", 18, 0.9, 3.9, 0.2, ["tomato", "kamatis"]),
  g("cucumber", "Cucumber, raw", 15, 0.7, 3.6, 0.1, ["cucumber", "pipino"]),
  g("lettuce", "Lettuce, raw", 15, 1.4, 2.9, 0.2, ["lettuce", "letsugas"]),
  g("corn", "Corn kernels", 86, 3.3, 19.0, 1.4, ["corn", "mais", "sweet corn"]),
  g("mushroom", "Mushroom, raw", 22, 3.1, 3.3, 0.3, ["mushroom", "kabute", "shiitake"]),

  // ---- fats ----
  ml("oil", "Cooking oil", 884, 0, 0, 100, ["cooking oil", "vegetable oil", "canola oil", "palm oil", "oil", "mantika"]),
  ml("sesame-oil", "Sesame oil", 884, 0, 0, 100, ["sesame oil"]),
  g("butter", "Butter", 717, 0.9, 0.1, 81.0, ["butter", "mantikilya"]),
  g("margarine", "Margarine", 717, 0.2, 0.7, 80.0, ["margarine", "star margarine"]),
  g("mayonnaise", "Mayonnaise", 680, 1.0, 0.6, 75.0, ["mayonnaise", "mayo"]),

  // ---- sauces and seasoning ----
  ml("soy-sauce", "Soy sauce (toyo)", 53, 8.1, 4.9, 0.6, ["soy sauce", "toyo", "soysauce"]),
  ml("oyster-sauce", "Oyster sauce", 51, 1.4, 11.0, 0.3, ["oyster sauce"]),
  {
    key: "vinegar",
    label: "Vinegar (suka)",
    basis: "100ml",
    macros: { kcal: 18, protein: 0, carbs: 0.9, fat: 0 },
    aka: ["vinegar", "suka"],
    atwaterExempt: "The energy is in the acetic acid, which is not a carb or a fat.",
  },
  ml("fish-sauce", "Fish sauce (patis)", 35, 5.1, 3.6, 0, ["fish sauce", "patis"]),
  ml("ketchup", "Ketchup", 101, 1.3, 25.0, 0.1, ["ketchup", "catsup", "banana ketchup", "tomato sauce"]),
  g("black-pepper", "Black pepper, ground", 251, 10.4, 64.0, 3.3, ["black pepper", "pepper", "paminta", "peppercorn"],
    "A gram or two per serving, so it moves a dish's total very little — but it is the shop's namesake, so it is here."),
  g("salt", "Salt", 0, 0, 0, 0, ["salt", "asin", "rock salt", "iodized salt"]),
  g("sugar", "Sugar, white", 387, 0, 100, 0, ["sugar", "asukal", "white sugar", "refined sugar"]),
  g("brown-sugar", "Brown sugar", 380, 0.1, 98.0, 0, ["brown sugar"]),
  g("msg", "MSG / seasoning granules", 0, 0, 0, 0, ["msg", "vetsin", "ajinomoto", "umami seasoning"],
    "Effectively no energy at the amounts used."),
  g("bouillon", "Bouillon / broth cube", 250, 10.0, 20.0, 14.0, ["bouillon", "broth cube", "knorr cube", "chicken cube", "pork cube", "magic sarap", "seasoning powder"]),
  g("cornstarch-slurry", "Starch and water slurry", 38, 0, 9.1, 0, ["slurry", "lusaw na gawgaw"]),

  // ---- dairy and drinks ----
  ml("milk", "Milk, whole", 61, 3.2, 4.8, 3.3, ["milk", "gatas", "fresh milk", "whole milk"]),
  ml("evap", "Evaporated milk", 135, 6.8, 10.0, 7.6, ["evaporated milk", "evap"]),
  ml("condensed", "Condensed milk", 321, 7.9, 54.0, 8.7, ["condensed milk", "condensada"]),
  g("cheese", "Cheese, cheddar", 403, 23.0, 3.1, 33.0, ["cheese", "keso", "cheddar", "quickmelt"]),
  g("iced-tea-powder", "Iced tea powder", 380, 0, 95.0, 0, ["iced tea", "tea powder", "iced tea powder", "juice powder", "powdered juice"]),
  ml("softdrink", "Soft drink", 42, 0, 10.6, 0, ["softdrink", "soft drink", "soda", "coke", "sprite", "royal"]),
  ml("water", "Water", 0, 0, 0, 0, ["water", "tubig", "mineral water", "distilled water"]),

  // ---- not food ----
  each("packaging", "Packaging (no nutrition)", 0, 0, 0, 0, [
    "box", "container", "bag", "plastic", "cup", "lid", "straw", "spoon", "fork",
    "tissue", "napkin", "paper bag", "styro", "pouch", "label", "sticker", "wrapper",
  ], "Not eaten, so every figure is zero — which is a real answer and stops it counting as missing."),
];

/** Lowercase, letters and digits only, single spaces. */
export function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The best reference for an ingredient name.
 *
 * Longest keyword wins. "Pork Belly (liempo)" must not match the bare "pork"
 * entry just because it appears earlier in the list — the two differ by a
 * factor of three in energy, so first-match ordering would quietly treble a
 * dish's calories.
 */
export function matchFood(name: string): ReferenceFood | null {
  const hay = ` ${normalise(name)} `;
  let best: ReferenceFood | null = null;
  let bestLength = 0;
  for (const food of REFERENCE) {
    for (const keyword of food.aka) {
      if (keyword.length <= bestLength) continue;
      if (hay.includes(` ${keyword} `) || hay.includes(` ${keyword}`) || hay.includes(`${keyword} `)) {
        best = food;
        bestLength = keyword.length;
      }
    }
  }
  return best;
}

export type Suggestion = {
  food: ReferenceFood;
  /** What to put in the boxes — already on the basis the form asks for. */
  typed: Macros;
  /**
   * Whether the reference's basis matches the ingredient's unit.
   *
   * A `100g` reference applied to something counted in pieces is not wrong so
   * much as unanswerable: nobody but the shop knows what one piece weighs.
   * The suggestion is still offered — an owner who knows a portion is 80 g
   * can scale it — but the screen has to say so rather than filling four
   * boxes with numbers that mean something else.
   */
  fits: boolean;
};

const MASS = new Set(["g", "gram", "grams"]);
const VOLUME = new Set(["ml", "millilitre", "milliliter"]);

export function suggestFor(name: string, unit: string | null | undefined): Suggestion | null {
  const food = matchFood(name);
  if (!food) return null;
  const u = (unit ?? "").trim().toLowerCase();
  const fits =
    (food.basis === "100g" && MASS.has(u)) ||
    (food.basis === "100ml" && (VOLUME.has(u) || MASS.has(u))) ||
    (food.basis === "each" && !MASS.has(u) && !VOLUME.has(u));
  return { food, typed: food.macros, fits };
}

/** Everything in the table, for a picker, newest concern first. */
export function allFoods(): ReferenceFood[] {
  return [...REFERENCE].sort((a, z) => a.label.localeCompare(z.label));
}
