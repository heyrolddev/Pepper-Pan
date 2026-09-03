import { NextResponse } from "next/server";
import { callerKey, rateLimit } from "@/lib/rate-limit";

/**
 * Address → coordinates, so typing "Blk 3 Lot 12, San Vicente, Apalit" drops
 * the pin without the customer hunting for their house on the map. Useful
 * precisely when "use my location" can't help — ordering to somewhere they
 * aren't standing.
 *
 * Proxied through our own route rather than called from the browser so we can
 * send the User-Agent that Nominatim's usage policy requires, keep the search
 * biased to the shop's region, and cache repeats.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Roughly Central Luzon around Apalit — keeps "San Vicente" from resolving to
// a same-named barangay on the other side of the country.
const VIEWBOX = "120.30,15.40,121.20,14.50";

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
};

export type GeocodeHit = { lat: number; lng: number; label: string };

// Small in-memory cache: customers retype the same barangay constantly, and
// Nominatim asks for no more than one request a second.
//
// Capped, because it is keyed by whatever the caller typed. Uncapped, anyone
// could grow it without limit by sending a stream of unique queries — the
// cache would have been the denial-of-service rather than the defence against
// one. Insertion order makes the first key the oldest, so evicting it keeps
// the entries most likely to be asked for again.
const cache = new Map<string, { at: number; hits: GeocodeHit[] }>();
const TTL_MS = 30 * 60_000;
const MAX_ENTRIES = 500;

/** Longer than any real address, and long enough that nothing legitimate hits it. */
const MAX_QUERY = 120;

export async function GET(request: Request) {
  // This route spends someone else's quota. Nominatim's usage policy is one
  // request a second, and it is the shop's address that gets blocked when a
  // script exceeds it — so the limit protects a service we do not control.
  const limit = rateLimit(callerKey(request, "geocode"), 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { hits: [] },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, MAX_QUERY) ?? "";
  if (q.length < 4) return NextResponse.json({ hits: [] });

  const key = q.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ hits: cached.hits });
  }

  // Append the country so a bare barangay name still resolves; Nominatim
  // handles the rest of the free-form text.
  const url =
    `${NOMINATIM}?format=jsonv2&limit=5&countrycodes=ph` +
    `&viewbox=${VIEWBOX}&bounded=0&q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim's policy requires a real identifying User-Agent.
        "User-Agent": "PepperPan/1.0 (order delivery address lookup)",
        "Accept-Language": "en",
      },
      // Don't let a slow third party hold the customer's typing hostage.
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return NextResponse.json({ hits: [] });

    const data = (await res.json()) as NominatimHit[];
    const hits: GeocodeHit[] = data
      .map((h) => ({
        lat: Number(h.lat),
        lng: Number(h.lon),
        label: h.display_name,
      }))
      .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng));

    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, { at: Date.now(), hits });
    return NextResponse.json({ hits });
  } catch {
    // A lookup failure is never fatal — the customer can still drag the pin.
    return NextResponse.json({ hits: [] });
  }
}
