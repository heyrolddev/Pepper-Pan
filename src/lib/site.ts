/**
 * The shop's own address on the internet, and the facts a search engine or a
 * chat app asks for before it will show a link as anything but bare text.
 *
 * A stall that markets on Facebook, Messenger and TikTok lives or dies on what
 * a pasted link looks like. Without this, every share is a naked URL; with it,
 * it's a card with the food, the name and a reason to tap.
 */

export const SHOP = {
  name: "Pepper Pan",
  tagline: "Home of Taiwan-Style Black Pepper Noodles",
  description:
    "Taiwan-style black pepper noodles, rice meals and milktea, made fresh daily in Apalit. Order ahead for pickup or delivery.",
  street: "In front of Palengkeni (New Apalit Public Market), beside Osave!",
  locality: "Apalit",
  region: "Pampanga",
  country: "PH",
  phone: "+63 947 353 3060",
  phoneHref: "+639473533060",
  priceRange: "₱₱",
} as const;

/**
 * Where the shop actually posts.
 *
 * The handles are stripped back to the plain profile URL — the ones copied
 * out of the apps carry `igsi`, `utm_source=qr`, `sender_device=pc` and the
 * like, which are that share's tracking, not the address of the page. They
 * work, but they'd sit in the site's markup forever telling every visitor
 * that the owner once scanned their own QR code.
 *
 * Order matters: the footer renders them in this order, and it's the order
 * the shop is most active in.
 */
export const SOCIALS = [
  {
    name: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61591109867523",
    handle: "Pepper Pan",
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/pepperpan.taiwanstylefood",
    handle: "@pepperpan.taiwanstylefood",
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com/@pepper.pan.taiwan",
    handle: "@pepper.pan.taiwan",
  },
] as const;

/**
 * Absolute URLs are required for share cards — a relative image path is simply
 * ignored by Facebook and Messenger, which is the failure that looks like
 * "the picture doesn't show up".
 *
 * Set NEXT_PUBLIC_SITE_URL once the shop has its own domain. Until then
 * Vercel names the production deployment for us, so sharing works out of the
 * box rather than waiting on a domain purchase.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
