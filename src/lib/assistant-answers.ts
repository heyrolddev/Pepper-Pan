import { peso } from "./peso.ts";

/**
 * The two replies the shop gets a say in, as pure functions over facts.
 *
 * Split out of `assistant.ts` so they can be tested. That file opens with
 * `import "server-only"` and reaches straight for the service-role client, so
 * nothing in it can be loaded by a test — which meant the words customers
 * actually read were the least-covered code in the project, and the
 * extra-rice bug lived there for weeks.
 *
 * The `./peso.ts` import is deliberate and is the one place in `src/` written
 * that way: Node's test runner strips types, it does not resolve the `@/*`
 * alias, and a second local copy of the peso formatter is exactly what was
 * removed from eleven files a few days ago.
 */

export type AnswerFacts = {
  /** The dish to name, already resolved from the pin or from the sales. */
  dish: { name: string; price: number; description: string | null } | null;
  /** True when a person chose it, which changes what the reply may claim. */
  pinned: boolean;
  /** The owner's own words, in place of the menu description. */
  note: string | null;
  /** Live promos, as written for the homepage. */
  promos: { title: string; body: string | null }[];
  /** Standing offers that were never announcements. */
  promoNote: string | null;
};

/**
 * What to try.
 *
 * The wording tracks where the answer came from, and that is not decoration.
 * "Our biggest seller" is a claim about the records and may only be made when
 * the records produced it; when the owner picked the dish, the shop
 * recommends it, which is a different — and also true — sentence. Software
 * that blurs those two is lying on the shop's behalf to its customers.
 */
export function recommendation(f: AnswerFacts, tl: boolean): string {
  if (!f.dish) {
    // Nothing chosen and nothing sold yet. Don't invent a favourite.
    return tl
      ? "Lahat po masarap, pero ang black pepper noodles po talaga ang hinahanap ng mga suki. Tingnan niyo po ang Menu page para sa buong lista!"
      : "Our black pepper noodles are what people come back for. Have a look at the Menu page for the full list!";
  }

  const why =
    f.note?.trim() ||
    f.dish.description?.trim() ||
    (tl ? "Subukan niyo po!" : "Give it a try!");

  if (f.pinned) {
    return tl
      ? `Ang lagi po naming nirerekomenda ay ${f.dish.name} — ${peso(f.dish.price)} lang po. ${why}`
      : `The one we always recommend is ${f.dish.name} at ${peso(f.dish.price)}. ${why}`;
  }
  return tl
    ? `Ang pinakamabenta po sa amin ay ${f.dish.name} — ${peso(f.dish.price)} lang po. ${why}`
    : `Our biggest seller is ${f.dish.name} at ${peso(f.dish.price)}. ${why}`;
}

/**
 * What's on offer.
 *
 * Assembled from the promos already written for the homepage, so a promo is
 * typed once and cannot be left running in the chat after it has finished —
 * which is the failure mode of every "paste it in here as well" field.
 *
 * Says plainly when there is nothing on. A customer who asks about a promo
 * and gets a hedge assumes there is one they were not told about.
 */
export function offers(f: AnswerFacts, tl: boolean): string {
  const lines = f.promos
    .map((p) => (p.body?.trim() ? `${p.title.trim()} — ${p.body.trim()}` : p.title.trim()))
    .filter((l) => l.length > 0);
  if (f.promoNote?.trim()) lines.push(f.promoNote.trim());

  if (lines.length === 0) {
    return tl
      ? "Wala po kaming promo ngayon, pero sulit pa rin po ang presyo namin — tingnan niyo po ang Menu page. Ipo-post po namin agad pag may bago."
      : "No promo running at the moment, but the menu is worth a look all the same — and we post new ones as soon as they start.";
  }

  const list = lines.map((l) => `• ${l}`).join("\n");
  return tl
    ? `Eto po ang meron kami ngayon:\n${list}\n\nNasa Menu page po ang buong lista.`
    : `Here's what's on right now:\n${list}\n\nThe full menu is on the Menu page.`;
}

/**
 * The words that mean "what's the deal", checked before the ones that mean
 * "what's good".
 *
 * Kept here beside the answer so the two cannot drift. "What's your best
 * deal" contains "best", which the recommendation branch also listens for —
 * so a customer asking about offers would be told about a dish unless this
 * list is consulted first. `assistant.ts` does exactly that, and a test holds
 * it to it.
 */
export const OFFER_WORDS = [
  "promo", "discount", "deal", "sale", "offer", "bargain", "voucher",
  "coupon", "bawas", "tawad", "mura", "murang", "libre", "sulit",
  "may bawas", "pabawas", "student discount", "senior",
];
