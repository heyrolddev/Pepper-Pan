/**
 * Delivery distance and pricing.
 *
 * Shared by the checkout form (to preview a fee as the pin moves) and by the
 * server action (which recomputes it and is the only figure that gets stored).
 * The client copy is a convenience, never the source of truth — a tampered
 * browser can send any fee it likes and the server ignores it.
 */

export type DeliverySettings = {
  is_enabled: boolean;
  shop_lat: number;
  shop_lng: number;
  base_fee: number;
  base_km: number;
  per_km_fee: number;
  min_fee: number;
  max_km: number;
  free_over: number;
  notice: string | null;
};

export const DEFAULT_DELIVERY: DeliverySettings = {
  is_enabled: true,
  // The stall itself (SHOP.lat/lng), so a shop that has never opened the
  // delivery settings still measures from the right place. Kept as literals
  // rather than importing SHOP: this is a starting value the owner is meant to
  // be able to move, not a mirror that snaps back.
  shop_lat: 14.9531856,
  shop_lng: 120.7576564,
  base_fee: 30,
  base_km: 2,
  per_km_fee: 10,
  min_fee: 30,
  max_km: 10,
  free_over: 0,
  notice: null,
};

/** Great-circle distance in kilometres. */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Quote =
  | { ok: true; km: number; fee: number; waived: boolean }
  | { ok: false; km: number; reason: string };

/**
 * Straight-line distance understates real road distance, so the result is
 * padded by a routing factor before pricing. 1.3 is the usual rule of thumb
 * for towns on a grid — it keeps the shop from under-charging on every trip.
 */
const ROUTE_FACTOR = 1.3;

export function quoteDelivery(
  settings: DeliverySettings,
  lat: number,
  lng: number,
  subtotal: number
): Quote {
  const straight = distanceKm(settings.shop_lat, settings.shop_lng, lat, lng);
  const km = Math.round(straight * ROUTE_FACTOR * 10) / 10;

  if (!settings.is_enabled) {
    return { ok: false, km, reason: "Delivery is paused right now — please choose pickup." };
  }
  if (km > Number(settings.max_km)) {
    return {
      ok: false,
      km,
      reason: `That's about ${km} km away, past our ${settings.max_km} km delivery limit. Pickup is still available.`,
    };
  }

  if (Number(settings.free_over) > 0 && subtotal >= Number(settings.free_over)) {
    return { ok: true, km, fee: 0, waived: true };
  }

  const extraKm = Math.max(0, km - Number(settings.base_km));
  const raw = Number(settings.base_fee) + extraKm * Number(settings.per_km_fee);
  const fee = Math.max(Number(settings.min_fee), Math.round(raw));

  return { ok: true, km, fee, waived: false };
}
