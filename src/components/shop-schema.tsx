import { SHOP, SOCIALS, siteUrl } from "@/lib/site";
import { getSchedule } from "@/lib/hours-server";
import { getDeliverySettings } from "@/lib/delivery-server";
import { getPublicReviews } from "@/lib/reviews-server";
import { isConfigured } from "@/lib/auth";
import { DAY_NAMES } from "@/lib/hours";

/**
 * What Google needs before it will show the shop as a place rather than a page.
 *
 * A stall's customers search "taiwanese food apalit" and "milktea near me", and
 * the result that wins is the one showing hours, a phone number and stars. None
 * of that comes from the visible page — it comes from this block, and without
 * it the site competes as a plain blue link.
 *
 * Every value is read from the shop's own data, so the hours Google shows are
 * the hours the owner actually set. A schema that drifts from reality is worse
 * than none: it sends people to a closed stall.
 */
export async function ShopSchema() {
  const url = siteUrl();

  const [schedule, reviews, delivery] = await Promise.all([
    getSchedule(),
    isConfigured()
      ? getPublicReviews(1)
      : Promise.resolve({ reviews: [], average: 0, count: 0 }),
    getDeliverySettings(),
  ]);

  const openingHours = schedule.configured
    ? schedule.hours
        .filter((h) => h.is_open)
        .map((h) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${DAY_NAMES[h.weekday]}`,
          opens: h.opens,
          closes: h.closes,
        }))
    : undefined;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${url}/#restaurant`,
    name: SHOP.name,
    description: SHOP.description,
    url,
    telephone: SHOP.phone,
    priceRange: SHOP.priceRange,
    servesCuisine: ["Taiwanese", "Asian", "Noodles"],
    // More than one, because a place result is a picture as much as a name.
    // The poster is a frame of the hero video and the story shot is the room
    // itself — between them a customer sees the food and where they'd eat it.
    image: [`${url}/opengraph-image`, `${url}/hero-poster.jpg`],
    address: {
      "@type": "PostalAddress",
      streetAddress: SHOP.street,
      addressLocality: SHOP.locality,
      addressRegion: SHOP.region,
      addressCountry: SHOP.country,
    },
    // Every profile the shop actually posts from. `sameAs` is how Google
    // ties this page to those accounts; listing one of three threw away the
    // other two.
    sameAs: SOCIALS.map((s) => s.href),

    // Where the stall actually is, to the metre.
    //
    // Read from the delivery settings rather than typed in here, because that
    // pin is already the one the owner dropped on a map and it is already the
    // one distances are charged from. A second copy of a coordinate is a
    // second thing to keep right, and the one that drifts is always the copy
    // nobody uses day to day.
    //
    // This is the single most useful thing on this block for "near me": an
    // address string has to be geocoded and guessed at, a coordinate does not.
    geo: {
      "@type": "GeoCoordinates",
      latitude: delivery.shop_lat,
      longitude: delivery.shop_lng,
    },

    // The radius the shop will actually travel, from the same settings that
    // enforce it at checkout — so what Google is told and what a customer is
    // allowed to order are the same number.
    ...(delivery.is_enabled
      ? {
          areaServed: {
            "@type": "GeoCircle",
            geoMidpoint: {
              "@type": "GeoCoordinates",
              latitude: delivery.shop_lat,
              longitude: delivery.shop_lng,
            },
            geoRadius: delivery.max_km * 1000,
          },
        }
      : {}),

    // Answers a question people search: "do they take GCash?"
    paymentAccepted: "Cash, GCash",
    currenciesAccepted: "PHP",
    hasMenu: `${url}/menu`,
    acceptsReservations: false,
    ...(openingHours?.length ? { openingHoursSpecification: openingHours } : {}),
    // Only claimed when it's true — a rating invented out of nothing is the
    // fastest way to have every rich result for this site suppressed.
    ...(reviews.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviews.average.toFixed(1),
            reviewCount: reviews.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    potentialAction: {
      "@type": "OrderAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${url}/menu`,
        inLanguage: "en-PH",
        actionPlatform: [
          "https://schema.org/DesktopWebPlatform",
          "https://schema.org/MobileWebPlatform",
        ],
      },
      deliveryMethod: [
        "https://schema.org/OnSitePickup",
        "https://schema.org/ParcelService",
      ],
    },
  };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is data, not markup, and the values are the
      // shop's own — but "</" is escaped anyway so a stray sequence in a
      // review or a closure note can't end the script tag early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
      }}
    />
  );
}
