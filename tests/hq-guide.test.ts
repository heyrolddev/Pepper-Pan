import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  TOPICS,
  findTopic,
  suggestions,
  topicsByGroup,
} from "../src/lib/hq-guide.ts";

/**
 * The assistant that refuses to invent things.
 *
 * Ask HQ has no language model behind it, which is the whole point: it cannot
 * describe a screen that doesn't exist. But that guarantee is only as good as
 * this list, and the list has two failure modes that nothing else catches.
 *
 * The first is DRIFT. A topic points at /admin/suppliers, somebody renames the
 * route, and the answer is still confidently sending the owner to a 404 — the
 * build passes, because a string is a string.
 *
 * The second is COLLISION. Triggers are scored by length, so adding a topic
 * about utang sa supplier can quietly steal every question about customer
 * utang. Nothing fails; the wrong answer simply appears, and it reads exactly
 * as authoritative as the right one.
 *
 * Both are tested here by asking real questions, in the words they would
 * actually be asked in.
 */

test("every topic is uniquely identified and reachable", () => {
  const ids = TOPICS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "two topics share an id");

  for (const t of TOPICS) {
    assert.ok(t.question.trim().length > 0, `${t.id} has no question`);
    assert.ok(t.answer.trim().length > 0, `${t.id} has no answer`);
    assert.ok(t.triggers.length > 0, `${t.id} can never be matched`);
    // `findTopic` ignores anything shorter than two characters, so a topic
    // whose triggers are all one letter is unreachable however it is asked.
    assert.ok(
      t.triggers.some((x) => x.trim().length >= 2),
      `${t.id} has no trigger long enough to match`
    );
  }

  // Every topic is offered somewhere. A topic in no group is a topic the
  // owner can only reach by guessing its exact wording.
  const grouped = topicsByGroup().flatMap((g) => g.topics.map((t) => t.id));
  assert.deepEqual([...ids].sort(), [...grouped].sort());

  assert.equal(suggestions().length, 6);
});

test("a topic's screen actually exists", () => {
  for (const t of TOPICS) {
    if (!t.where) continue;
    const route = t.where.href.replace(/^\//, "");
    assert.ok(
      existsSync(`src/app/${route}/page.tsx`),
      `${t.id} points at ${t.where.href}, which has no page`
    );
  }
});

/**
 * A topic that asks for live figures needs the server to know how to work
 * them out. Miss the case and `explain` falls off the end of the switch and
 * returns undefined — the answer renders with no numbers under it and nothing
 * anywhere says why.
 */
test("every topic that promises numbers has a server case", () => {
  const server = readFileSync("src/lib/hq-guide-server.ts", "utf8");
  for (const t of TOPICS) {
    if (!t.numbers) continue;
    assert.ok(
      server.includes(`case "${t.numbers}":`),
      `${t.id} asks for "${t.numbers}" numbers that the server cannot produce`
    );
  }
});

test("questions reach the topic they are actually about", () => {
  const asked: [question: string, id: string][] = [
    // The pair most at risk of stealing each other: two kinds of utang,
    // pointing in opposite directions.
    ["may utang sa akin yung customer", "utang"],
    ["how much do i owe my supplier", "supplier-utang"],
    ["may utang ako sa supplier", "supplier-utang"],

    // The new money topics against the old ones.
    ["magkano lahat ng pera ko", "pots"],
    ["how is cash in the drawer worked out", "cash"],
    ["kailan mauubos ang gas", "gas-tank"],
    ["saan ko ilalagay ang paper towel at alcohol", "running-costs"],
    ["how much do i need to sell in a day", "break-even"],
    ["sulit ba yung ads namin", "marketing-calc"],

    // The kitchen.
    ["can a batch use another batch", "batch-in-batch"],
    ["mali ang bilang ng stock", "count"],
    ["where is the supplier list", "suppliers"],
    ["how do i record a delivery", "restock"],
    ["how do i change the price of a dish", "dish-price"],

    // Every day.
    ["what does the grey badge mean", "counter-badges"],
    ["saan ko makikita ang activity log", "history"],
    ["how do i ring up a walk in customer", "counter"],
  ];

  for (const [question, id] of asked) {
    const hit = findTopic(question);
    assert.equal(hit?.id, id, `"${question}" landed on ${hit?.id ?? "nothing"}`);
  }
});

test("nonsense gets no answer rather than the nearest one", () => {
  // The single most important behaviour here. A guess would be believed.
  assert.equal(findTopic("qwertyuiop zxcvbnm"), null);
  assert.equal(findTopic("a"), null);
  assert.equal(findTopic(""), null);
});

test("the add-ons topic answers the question that started it", () => {
  // Asked in Taglish, which is how it was asked: "may extra rice ba sa mga
  // rice meals" and "pwede na rin sila mamili ng drinks nila, parang combo".
  for (const q of [
    "paano mag add ng extra rice",
    "pwede bang mamili ng inumin parang combo",
    "how do i do a combo meal like jollibee",
  ]) {
    assert.equal(findTopic(q)?.id, "add-ons", q);
  }
});
