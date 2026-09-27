import { SHOP } from "@/lib/site";

/**
 * Ask the people who have actually eaten here.
 *
 * ── Where it goes, and why not everywhere ───────────────────────────────
 *
 * A review button is easy to scatter and easy to waste. Somebody landing on
 * the homepage for the first time has nothing to say yet, and asking them
 * reads as a shop more interested in its rating than in feeding them. So it
 * sits in exactly two places, both of which mean "you already know what we
 * taste like":
 *
 *   the reviews block, where somebody is reading what other regulars said
 *   and is one thought away from adding theirs;
 *
 *   and Come see us, the local-business block — directions, phone, hours —
 *   which is the same block Google itself is built out of, and the one a
 *   returning customer opens to find the stall again.
 *
 * ── Why Google and not the shop's own reviews ───────────────────────────
 *
 * They do different jobs and the shop needs both. A review on this site
 * sells the next visitor who is already here; a review on Google is what
 * decides whether somebody searching "food near Apalit" is shown the stall
 * at all. Hence `outline`: on the reviews page the shop's own form is the
 * loud button and this is the quiet second one, because a customer who
 * leaves for Google mid-thought usually does not come back to write both.
 */
export function GoogleReviewButton({
  tone = "solid",
  className = "",
}: {
  /** `solid` where it leads, `outline` where it sits beside a louder one. */
  tone?: "solid" | "outline";
  className?: string;
}) {
  return (
    <a
      href={SHOP.reviewUrl}
      // Opened in a new tab on purpose: writing a review is a detour, and a
      // customer who is mid-order should come back to a cart that is still
      // there. `noreferrer` with it, so the shop's own URLs are not handed
      // to Google as a referrer on a page a customer may have reached from
      // their own order.
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2.5 rounded-full px-6 py-3 font-bold transition-transform hover:scale-105 ${
        tone === "solid"
          ? "bg-cream-50 text-ink-950"
          : "border-2 border-ink-950 text-ink-950 hover:bg-ink-950 hover:text-cream-50"
      } ${className}`}
    >
      {/* Google's own mark, in its own four colours — a plain star would
          read as this site's rating rather than as "leave one over there",
          which is the whole point of the button. */}
      <svg
        aria-hidden
        viewBox="0 0 48 48"
        className="h-5 w-5 shrink-0"
      >
        <path
          fill="#4285F4"
          d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1Z"
        />
        <path
          fill="#34A853"
          d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.7C7.9 41 15.4 46 24 46Z"
        />
        <path
          fill="#FBBC05"
          d="M11.6 28.1c-.5-1.4-.7-2.8-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.3-5.7Z"
        />
        <path
          fill="#EA4335"
          d="M24 10.4c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 3.9 30 2 24 2 15.4 2 7.9 7 4.3 14.2l7.3 5.7c1.8-5.2 6.6-9.5 12.4-9.5Z"
        />
      </svg>
      <span>Review us on Google</span>
      <span
        aria-hidden
        className="transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </a>
  );
}
