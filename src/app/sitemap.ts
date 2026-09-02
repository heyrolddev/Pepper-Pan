import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { getPublicFeed } from "@/lib/announcements-server";

/**
 * Every page worth finding, and how recently it changed.
 *
 * Without this file a search engine discovers pages only by following links,
 * which for a new site with almost no inbound links means it discovers very
 * little and slowly. The sitemap is the shortcut: here is the whole shop, in
 * one request, with dates.
 *
 * The news and promo posts are read live rather than listed by hand. A
 * hand-written list would be correct on the day it was written and quietly
 * wrong forever after — the owner adds a promo, and the one page most likely
 * to earn a search never gets crawled because nobody remembered to add it
 * here. That failure is silent, which is what makes it worth designing out.
 *
 * `lastModified` is not decoration. A crawler uses it to decide whether to
 * re-fetch, so a real date on a real change is what gets an updated menu
 * re-read in days instead of weeks.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = siteUrl();
  const now = new Date();

  // Priority is relative within this one site, not a score against the rest
  // of the web. The menu is what a customer is looking for, so it sits with
  // the homepage rather than below it.
  const core: MetadataRoute.Sitemap = [
    { url: `${url}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${url}/menu`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${url}/news`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${url}/reviews`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${url}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  // A post that can't be read is a dead entry in the sitemap, and a sitemap
  // full of those is treated as a low-quality signal. The feed already filters
  // to live posts with something to open, so the same rule that decides what
  // /news shows decides what is listed here.
  let posts: MetadataRoute.Sitemap = [];
  try {
    const feed = await getPublicFeed();
    // The feed is split into promos and news for the page that renders them;
    // a sitemap does not care which is which, only that both are readable.
    posts = [...feed.promos, ...feed.news].map((post) => ({
      url: `${url}/news/${post.id}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // Supabase unreachable at build time is not a reason to serve no sitemap
    // at all. The core pages are the ones that matter most; the posts come
    // back on the next revalidation.
  }

  return [...core, ...posts];
}
