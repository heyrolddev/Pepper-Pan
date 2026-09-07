/**
 * A person's face, or the next best thing.
 *
 * One component for every place a customer appears — review cards, the
 * carousel, HQ — so the photo and the fallback initial are never two
 * different sizes, two different circles, or two different colours depending
 * on which page you are on.
 *
 * The fallback is a letter rather than a grey silhouette on purpose. Most
 * accounts will never upload a photo, so the no-photo case is the common case
 * and has to look deliberate rather than broken. A coloured initial reads as a
 * design; a placeholder head reads as a missing image.
 *
 * `tone` exists because the homepage carousel sits on the dark section, where
 * the cream-on-red initial that works everywhere else disappears.
 */
export function Avatar({
  name,
  url,
  size = 40,
  tone = "light",
  className = "",
}: {
  /** The display name. Only its first letter is used. */
  name: string;
  url: string | null;
  /** Rendered pixel size. Kept as a number so the img gets real dimensions. */
  size?: number;
  tone?: "light" | "dark";
  className?: string;
}) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  const ring =
    tone === "dark" ? "ring-1 ring-cream-50/25" : "ring-1 ring-ink-950/10";
  const fallback =
    tone === "dark"
      ? "bg-cream-50/15 text-cream-50"
      : "bg-brand-600 text-cream-50";

  if (url) {
    return (
      // Not next/image: the src is a file the customer uploaded to the shop's
      // own bucket, and the optimiser needs every host declared up front —
      // one more thing to configure before a photo can appear. The file is
      // already squared and shrunk to 512px in the browser before upload
      // (see `shrink-image.ts`), which is what the optimiser would have been
      // for.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${name}'s profile picture`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full bg-cream-100 object-cover ${ring} ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`grid shrink-0 place-items-center rounded-full font-display font-black leading-none ${fallback} ${ring} ${className}`}
    >
      {letter}
    </span>
  );
}
