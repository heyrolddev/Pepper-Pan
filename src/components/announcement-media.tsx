import type { Announcement } from "@/lib/announcements";

export { hasMedia } from "@/lib/announcements";

/**
 * The photo or video on a promo or a news post, wherever it appears.
 *
 * A video behaves differently depending on where it is. On a card it is a
 * moving photograph — muted, looping, no controls, playing itself — because
 * nobody taps play on a card they are scrolling past, and a video that needs
 * a tap on a homepage is a still frame with a triangle on it. On its own page
 * the customer chose to be there, so it gets controls and does not loop.
 *
 * `muted` is not a style choice: without it a browser refuses to autoplay at
 * all, and the card silently shows a frozen frame.
 */
export function AnnouncementMedia({
  row,
  full = false,
  className = "",
}: {
  row: Announcement;
  /** On its own page rather than on a card. */
  full?: boolean;
  className?: string;
}) {
  if (row.video_url) {
    return (
      <video
        src={row.video_url}
        className={className}
        autoPlay={!full}
        loop={!full}
        muted={!full}
        controls={full}
        playsInline
        preload="metadata"
        aria-label={row.title}
      />
    );
  }

  if (row.image_url) {
    return (
      // Not next/image: the src is whatever the shop uploaded to its own
      // bucket, and the optimiser needs each host declared up front — one
      // more thing to configure before a photo can go up.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={row.image_url} alt={row.title} className={className} loading={full ? "eager" : "lazy"} />
    );
  }

  return null;
}

