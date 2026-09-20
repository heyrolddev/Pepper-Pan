import { SHOP, siteUrl } from "@/lib/site";
import { jsonLd } from "@/lib/json-ld";
import { isSoldOut, type Product } from "@/lib/menu-products";

/**
 * The menu, in the form a search engine can actually read.
 *
 * `ShopSchema` already tells Google there is a restaurant here and links to
 * `/menu` — but a link is all it is. Google knows a menu exists; it does not
 * know that one of the dishes is Black Pepper Noodles at ₱149. That is the
 * difference between ranking for "taiwanese food apalit" and ranking for
 * "black pepper noodles", which is the search with the customer already
 * decided on it.
 *
 * Every value comes from the same rows the page renders. There is no second
 * list to keep in step: if a dish is renamed or repriced in HQ, this changes
 * with it. A schema that says ₱149 over a page that says ₱169 is not a small
 * inconsistency — Google treats a price mismatch as a reason to distrust the
 * whole block, and the rich result disappears with no message to say why.
 */
export function MenuSchema({
  products,
  categories,
}: {
  products: Product[];
  categories: { name: string }[];
}) {
  if (!products.length) return null;

  const url = siteUrl();

  // Grouped by the same categories the page shows, because a menu Google reads
  // as one flat list of nineteen things is a menu it cannot summarise. Dishes
  // whose category no longer exists still belong somewhere, so they fall into
  // a final section rather than vanishing from the markup.
  const named = categories
    .map((c) => ({
      name: c.name,
      items: products.filter((m) => m.categories?.[0] === c.name),
    }))
    .filter((s) => s.items.length > 0);

  const placed = new Set(named.flatMap((s) => s.items.map((m) => m.id)));
  const rest = products.filter((m) => !placed.has(m.id));
  const sections = rest.length ? [...named, { name: "More", items: rest }] : named;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${url}/menu#menu`,
    name: `${SHOP.name} menu`,
    url: `${url}/menu`,
    inLanguage: "en-PH",
    // Ties the menu back to the Restaurant block on the homepage, so the two
    // are read as one business rather than two unrelated things.
    isPartOf: { "@id": `${url}/#restaurant` },
    hasMenuSection: sections.map((section) => ({
      "@type": "MenuSection",
      name: section.name,
      hasMenuItem: section.items.map((product) => ({
        "@type": "MenuItem",
        name: product.name,
        ...(product.description ? { description: product.description } : {}),
        ...(product.image_url ? { image: product.image_url } : {}),
        /**
         * One offer per way of having it, named.
         *
         * A card that holds four ji pai at two prices cannot honestly be one
         * offer: quoting the cheapest makes a ₱169 dish advertise at ₱155,
         * and Google treats a price on the page that disagrees with the price
         * in the markup as a reason to distrust the whole block — not just
         * this dish, the whole site's rich results.
         *
         * `availability` is per offer too, so a sold-out spicy takes itself
         * out of the search result while the original stays in.
         */
        offers: product.variants.map((v) => ({
          "@type": "Offer",
          ...(product.variants.length > 1 ? { name: v.name } : {}),
          price: v.price.toFixed(2),
          priceCurrency: "PHP",
          availability: isSoldOut(v)
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
        })),
        // Only claimed where real ratings exist. An invented rating is the
        // fastest way to have every rich result for this site suppressed,
        // and the suppression is site-wide, not just for the dish that lied.
        ...(product.reviewCount && product.avgRating
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: product.avgRating.toFixed(1),
                reviewCount: product.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
      })),
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLd(schema),
      }}
    />
  );
}
