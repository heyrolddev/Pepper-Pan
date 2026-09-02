import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * What a crawler is allowed to read, and where the map is.
 *
 * Two jobs, and the second one is the one people forget. Pointing at the
 * sitemap is how a new site gets found at all — a crawler that has never seen
 * a link to this shop has no other way in.
 *
 * The disallow list is not about secrecy. Every one of those routes is already
 * behind an auth check, so a crawler gets a redirect, not data. It is about not
 * spending the crawl budget: a search engine will only fetch so many pages of a
 * small site per visit, and every request it wastes on a login form is a
 * request it did not spend on a dish. It also keeps a half-finished checkout
 * page out of the results, which is the kind of thing that turns up months
 * later as "why does Google show my cart".
 */
export default function robots(): MetadataRoute.Robots {
  const url = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",       // the whole of HQ — sales, costs, staff
          "/account",
          "/orders",
          "/cart",
          "/checkout",
          "/login",
          "/signup",
          "/forgot-password",
          "/auth/",
          "/api/",
        ],
      },
    ],
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
