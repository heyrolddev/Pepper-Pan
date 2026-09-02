import { siteUrl } from "@/lib/site";
import type { SiteFaq } from "@/lib/faq-site";

/**
 * The homepage questions, offered to search engines as questions.
 *
 * Worth doing for a small site specifically: a stall cannot out-rank a chain
 * on authority, but an FAQ block can take two or three extra lines of a
 * results page, and vertical space on the page is the thing you are actually
 * competing for. "Do you deliver?" answered directly under the link is worth
 * more than a higher position with one line.
 *
 * Google's rule is that the answer must be visible on the page. These are the
 * same rows the FAQ section renders, from the same call, so the markup cannot
 * drift from what a reader sees — which is both the rule and the honest thing.
 * Marking up answers that are not on the page is the exact behaviour that gets
 * a site's rich results turned off.
 */
export function FaqSchema({ faqs }: { faqs: SiteFaq[] }) {
  if (!faqs.length) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${siteUrl()}/#faq`,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
      }}
    />
  );
}
