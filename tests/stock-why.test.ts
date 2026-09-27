import test from "node:test";
import assert from "node:assert/strict";
import {
  alsoDrawOn,
  explainStock,
  lineArithmetic,
  whySentence,
} from "../src/lib/stock-why.ts";
import { remainingFor, type PoolShort, type Shortfall } from "../src/lib/costing.ts";

/**
 * The shop's own numbers, because they are the ones that were confusing.
 *
 * BP M.Chicken: 18 packs made, 1 pack a serving — so the chicken alone
 * allows 18 of anything. The noodle dishes showed 7 and the rice dishes 8.
 * Every test below is that screen.
 */
const chicken = (need = 1): Shortfall => ({
  refId: "bp-chicken",
  label: "BP M.Chicken",
  kind: "batch",
  unit: "pack",
  need,
  have: 18,
  allows: Math.floor(18 / need),
});

const noodles: Shortfall = {
  refId: "noodles",
  label: "Egg Noodles",
  kind: "ingredient",
  unit: "g",
  need: 200,
  have: 1400,
  allows: 7,
};

const rice: Shortfall = {
  refId: "rice",
  label: "Rice",
  kind: "ingredient",
  unit: "g",
  need: 250,
  have: 2000,
  allows: 8,
};

test("the batch with plenty is not what sets the number", () => {
  const why = explainStock([chicken(), noodles]);

  assert.equal(why.left, 7);
  assert.deepEqual(
    why.binding.map((l) => l.label),
    ["Egg Noodles"]
  );
  // The whole point. 18 packs of chicken were on screen and the dish said 7;
  // the panel has to name the chicken as the thing that is NOT the problem,
  // or the cashier is left with the same contradiction they started with.
  assert.deepEqual(
    why.roomy.map((l) => l.label),
    ["BP M.Chicken"]
  );
  assert.equal(why.roomy[0].allowsNow, 18);
});

test("two dishes sharing one batch differ because their OTHER line differs", () => {
  assert.equal(explainStock([chicken(), noodles]).left, 7);
  assert.equal(explainStock([chicken(), rice]).left, 8);
});

test("tightest first, so the thing to go and fix is at the top", () => {
  const why = explainStock([chicken(), rice, noodles]);
  assert.deepEqual(
    why.lines.map((l) => l.label),
    ["Egg Noodles", "Rice", "BP M.Chicken"]
  );
});

test("two things running out together are both named", () => {
  // Restocking only the one at the top would move the number by nothing.
  const why = explainStock([
    { ...noodles, have: 1400 },
    { ...rice, have: 1750, allows: 7 },
  ]);
  assert.equal(why.left, 7);
  assert.deepEqual(
    why.binding.map((l) => l.label).sort(),
    ["Egg Noodles", "Rice"]
  );
  assert.equal(why.roomy.length, 0);
  assert.equal(
    whySentence(why),
    "7 left because Egg Noodles and Rice run out together."
  );
});

test("no recipe is unknown, not zero", () => {
  const why = explainStock([]);
  assert.equal(why.left, null);
  assert.deepEqual(why.binding, []);
  assert.match(whySentence(why), /unknown, not sold out/);
});

test("a line needing nothing cannot be the reason for anything", () => {
  // A zero-qty recipe line would divide to Infinity and, worse, would sit in
  // the panel as a line the cashier might go and restock for no effect.
  const why = explainStock([{ ...noodles, need: 0 }, chicken()]);
  assert.equal(why.left, 18);
  assert.deepEqual(
    why.lines.map((l) => l.label),
    ["BP M.Chicken"]
  );
});

test("what is already on the ticket comes off before the explanation", () => {
  const claimed = new Map<string, PoolShort>([
    [
      "noodles",
      { refId: "noodles", label: "Egg Noodles", kind: "ingredient", unit: "g", have: 1400, need: 600 },
    ],
  ]);
  const why = explainStock([chicken(), noodles], claimed);

  // 1400 - 600 = 800g, at 200g a serving = 4 more.
  assert.equal(why.left, 4);
  const line = why.lines[0];
  assert.equal(line.claimed, 600);
  assert.equal(line.haveNow, 800);
  assert.match(lineArithmetic(line), /800 g left after this ticket/);
  assert.match(lineArithmetic(line), /1,400 on the shelf, 600 spoken for/);
});

test("a ticket that has taken more than the shelf holds reads as zero, not negative", () => {
  const claimed = new Map<string, PoolShort>([
    [
      "noodles",
      { refId: "noodles", label: "Egg Noodles", kind: "ingredient", unit: "g", have: 1400, need: 2000 },
    ],
  ]);
  const why = explainStock([noodles], claimed);
  assert.equal(why.left, 0);
  assert.equal(why.lines[0].haveNow, 0);
  assert.equal(whySentence(why), "Out because Egg Noodles has run out.");
});

test("the arithmetic is spelled out, because that is the answer", () => {
  const why = explainStock([chicken(), noodles]);
  assert.equal(
    lineArithmetic(why.binding[0]),
    "1,400 g on the shelf, 200 g a serving"
  );
  assert.equal(
    lineArithmetic(why.roomy[0]),
    "18 pack on the shelf, 1 pack a serving"
  );
});

test("a fractional need is not rounded away", () => {
  const why = explainStock([
    { refId: "oil", label: "Oil", kind: "ingredient", unit: "L", need: 0.125, have: 2, allows: 16 },
  ]);
  assert.equal(why.left, 16);
  assert.match(lineArithmetic(why.lines[0]), /0\.125 L a serving/);
});

// ── who else is using it ──────────────────────────────────────────────────

const MEALS = [
  { id: "la-noodles", name: "La/BP Chicken Noodles", limits: [chicken(), noodles] },
  { id: "xl-noodles", name: "XL/BP Chicken Noodles", limits: [chicken(2), noodles] },
  { id: "la-rice", name: "La/BP Chicken Rice", limits: [chicken(), rice] },
  { id: "xl-rice", name: "XL/BP Chicken Rice", limits: [chicken(2), rice] },
  { id: "lumpia", name: "Lumpia", limits: [] },
];

test("every other dish drawing on the same batch is named", () => {
  const sharers = alsoDrawOn("bp-chicken", MEALS, "la-noodles");
  assert.deepEqual(
    sharers.map((s) => s.name),
    [
      // Heaviest user first: the XLs take two packs each, so they move the
      // count twice as fast and are what the cashier should know about.
      "XL/BP Chicken Noodles",
      "XL/BP Chicken Rice",
      "La/BP Chicken Rice",
    ]
  );
  assert.deepEqual(
    sharers.map((s) => s.need),
    [2, 2, 1]
  );
});

test("the dish being explained is never listed as sharing with itself", () => {
  for (const m of MEALS) {
    const sharers = alsoDrawOn("bp-chicken", MEALS, m.id);
    assert.ok(!sharers.some((s) => s.mealId === m.id), `${m.name} shared with itself`);
  }
});

test("something only one dish uses has no sharers", () => {
  assert.deepEqual(alsoDrawOn("noodles", MEALS, "la-noodles").map((s) => s.name), [
    "XL/BP Chicken Noodles",
  ]);
  assert.deepEqual(alsoDrawOn("nothing-uses-this", MEALS, "la-noodles"), []);
});

test("a dish with no recipe is not dragged into somebody else's explanation", () => {
  const sharers = alsoDrawOn("bp-chicken", MEALS, "la-noodles");
  assert.ok(!sharers.some((s) => s.name === "Lumpia"));
});

/**
 * The claim the whole panel rests on.
 *
 * Each count is that dish ALONE. The four on the owner's screen added up to
 * 30 servings out of 18 packs of chicken — every number true by itself and
 * the set of them badly misleading. If this ever stops being true the panel
 * should stop saying it, so it is asserted rather than trusted.
 */
test("the counts cannot be added up, which is why the panel says so", () => {
  const each = MEALS.filter((m) => m.limits.length > 0).map(
    (m) => explainStock(m.limits).left ?? 0
  );
  assert.deepEqual(each, [7, 7, 8, 8]);

  const naive = each.reduce((a, b) => a + b, 0);
  assert.equal(naive, 30);

  // What the shelf could actually do if every sale were one of these: 18
  // packs, and the XLs take two. Nowhere near 30 whichever way it is split.
  assert.ok(naive > 18, "the sum of the tiles overstates the shelf");
});

/**
 * The panel's number and the badge's number are worked out by two different
 * functions, and they sit two centimetres apart on the same screen.
 *
 * `remainingFor` paints the tile; `explainStock` writes the explanation. If
 * they ever drift, the till shows "7 left" above a panel headed "why 6 left"
 * — two things stating different facts while both look authoritative, which
 * is worse than either being wrong on its own. So they are checked against
 * each other across every shape that has bitten this code before.
 */
test("the explanation's number is always the badge's number", () => {
  const cases: { name: string; limits: Shortfall[]; claimed: Map<string, PoolShort> }[] = [
    { name: "no recipe", limits: [], claimed: new Map() },
    { name: "one line", limits: [noodles], claimed: new Map() },
    { name: "batch with room", limits: [chicken(), noodles], claimed: new Map() },
    { name: "a tie", limits: [noodles, { ...rice, have: 1750, allows: 7 }], claimed: new Map() },
    { name: "zero-qty line", limits: [{ ...noodles, need: 0 }, chicken()], claimed: new Map() },
    { name: "already out", limits: [{ ...noodles, have: 0, allows: 0 }], claimed: new Map() },
    {
      name: "part of the shelf in the basket",
      limits: [chicken(), noodles],
      claimed: new Map([
        ["noodles", { refId: "noodles", label: "Egg Noodles", kind: "ingredient", unit: "g", have: 1400, need: 600 }],
      ]),
    },
    {
      name: "the basket has overdrawn it",
      limits: [chicken(), noodles],
      claimed: new Map([
        ["noodles", { refId: "noodles", label: "Egg Noodles", kind: "ingredient", unit: "g", have: 1400, need: 5000 }],
      ]),
    },
    {
      name: "fractional needs",
      limits: [{ refId: "oil", label: "Oil", kind: "ingredient", unit: "L", need: 0.125, have: 2, allows: 16 }],
      claimed: new Map(),
    },
  ];

  for (const c of cases) {
    assert.equal(
      explainStock(c.limits, c.claimed).left,
      remainingFor(c.limits, c.claimed),
      `the panel and the tile disagree on "${c.name}"`
    );
  }
});
