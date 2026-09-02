/**
 * The questions the homepage answers.
 *
 * These used to be five objects in the homepage source, which meant the shop
 * could not fix a wrong answer without a deploy — and meant the answer on the
 * page and the answer Ask Pepper Pan gave could differ, with nothing to
 * notice it. Both now come from `faq_entries`; this is just the shape and
 * the fallback.
 */

export type SiteFaq = { question: string; answer: string };

/**
 * What to show if the table cannot be read at all.
 *
 * The same five, as they were. A homepage that renders without its FAQ looks
 * broken; one that renders the shop's standing answers does not, and these
 * have been true since the day they were written.
 */
export const DEFAULT_FAQS: SiteFaq[] = [
  {
    question: "How do I place an order?",
    answer:
      "Browse the menu, add what you want to your cart, and check out. You can pick it up at the stall or have it delivered.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "Cash on pickup or delivery, and GCash. Send the GCash reference after paying and we'll confirm it.",
  },
  {
    question: "Do you offer delivery?",
    answer:
      "Yes, around Apalit. The fee depends on how far you are — you'll see it at checkout before you confirm.",
  },
  {
    question: "Can I customize my order?",
    answer:
      "Leave a note at checkout and we'll do what we can — extra sauce, no egg, that sort of thing.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "Yes, but it is quick: an email address and a password. It is what lets you track your order and reorder in one tap.",
  },
];
