import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  OFFER_WORDS,
  offers,
  recommendation,
  type AnswerFacts,
} from "../src/lib/assistant-answers.ts";

/**
 * The words a customer actually reads.
 *
 * Least-covered code in the project until now, because `assistant.ts` cannot
 * be loaded outside a server — which is where the bug the owner caught lived:
 * asked for the bestseller, the shop told customers it was extra rice.
 */

const facts = (over: Partial<AnswerFacts> = {}): AnswerFacts => ({
  dish: null,
  pinned: false,
  note: null,
  promos: [],
  promoNote: null,
  ...over,
});

const jipai = { name: "Solo Ji Pai", price: 189, description: "Crispy, peppery." };

// --- the recommendation ----------------------------------------------------

test("a pinned dish is recommended, not reported as a record", () => {
  // The distinction matters: "our biggest seller" is a claim about the books.
  // The shop may recommend whatever it likes; it may not invent a statistic.
  const said = recommendation(facts({ dish: jipai, pinned: true }), false);
  assert.match(said, /we always recommend/i);
  assert.doesNotMatch(said, /biggest seller|most-ordered/i);
});

test("with nothing pinned it reports the sales, and says so", () => {
  const said = recommendation(facts({ dish: jipai, pinned: false }), false);
  assert.match(said, /biggest seller/i);
});

test("the price in the answer is the dish's live price", () => {
  // Never typed by the owner — the pin is a reference, so a price change on
  // the menu changes the reply and cannot leave it quoting last month.
  assert.match(recommendation(facts({ dish: jipai, pinned: true }), false), /₱189/);
});

test("the owner's own words replace the menu description", () => {
  const said = recommendation(
    facts({ dish: jipai, pinned: true, note: "Paborito ng mga suki." }),
    false
  );
  assert.match(said, /Paborito ng mga suki\./);
  assert.doesNotMatch(said, /Crispy, peppery/);
});

test("a dish with no description still gets a whole sentence", () => {
  const bare = { name: "Rice", price: 25, description: null };
  const said = recommendation(facts({ dish: bare, pinned: true }), false);
  assert.match(said, /Give it a try/);
});

test("with no dish at all it points at the menu instead of inventing one", () => {
  const said = recommendation(facts(), false);
  assert.match(said, /Menu page/);
});

test("Taglish is answered in Taglish", () => {
  assert.match(recommendation(facts({ dish: jipai, pinned: true }), true), /nirerekomenda/);
  assert.match(offers(facts(), true), /Wala po kaming promo/);
});

// --- offers ----------------------------------------------------------------

test("live promos are read out, with their detail", () => {
  const said = offers(
    facts({ promos: [{ title: "Free coffee", body: "when you dine in" }] }),
    false
  );
  assert.match(said, /Free coffee — when you dine in/);
});

test("a promo with no detail is still offered", () => {
  const said = offers(facts({ promos: [{ title: "₱20 off Ji Pai", body: null }] }), false);
  assert.match(said, /₱20 off Ji Pai/);
  assert.doesNotMatch(said, /—/);
});

test("the standing note is added under whatever is live", () => {
  const said = offers(
    facts({
      promos: [{ title: "Free coffee", body: null }],
      promoNote: "Suki discount from five up.",
    }),
    false
  );
  const at = said.indexOf("Free coffee");
  assert.ok(at > -1 && said.indexOf("Suki discount") > at, "the note comes after the promos");
});

test("the standing note answers on its own when nothing is running", () => {
  const said = offers(facts({ promoNote: "Ask about bulk orders." }), false);
  assert.match(said, /Ask about bulk orders\./);
  assert.doesNotMatch(said, /No promo running/);
});

test("no promo is said plainly, not hedged", () => {
  // A hedge reads as "there is one and we're not telling you".
  const said = offers(facts(), false);
  assert.match(said, /No promo running/);
});

test("a blank title does not become an empty bullet", () => {
  const said = offers(facts({ promos: [{ title: "   ", body: null }] }), false);
  assert.match(said, /No promo running/);
});

// --- routing ---------------------------------------------------------------

test("asking for the best deal reaches offers, not the dish of the day", () => {
  // "best deal" contains "best", which the recommendation branch listens for.
  const asked = "whats your best deal today";
  assert.ok(
    OFFER_WORDS.some((w) => asked.includes(w)),
    "the offer words have to catch this before the recommendation does"
  );
});

test("offers really are checked first in the router", () => {
  // The guarantee above is only worth anything if the branches run in that
  // order, which is a property of the source, not of either function.
  const src = readFileSync("src/lib/assistant.ts", "utf8");
  const atOffers = src.indexOf("OFFER_WORDS");
  const atDish = src.indexOf('"bestseller", "best seller"');
  assert.ok(atOffers > -1 && atDish > -1, "both branches must exist");
  assert.ok(atOffers < atDish, "offers must be matched before the recommendation");
});

test("the offer words do not swallow a delivery question", () => {
  // "is delivery free" must reach the delivery answer. It does because that
  // branch is earlier — but "free" is kept out of this list as well, so the
  // two are not relying on ordering alone.
  assert.equal(OFFER_WORDS.includes("free"), false);
});
