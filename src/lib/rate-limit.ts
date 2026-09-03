/**
 * A ceiling on how often one caller may do something.
 *
 * The shop has three doors that anyone on the internet can knock on without
 * signing in: the chat widget, the address lookup, and the login form. None
 * of them had a limit, which meant the cost of abusing them was the
 * attacker's bandwidth and nothing else — and the cost of *being* abused was
 * the shop's: a database filling with junk threads, an owner's inbox burying
 * a real customer, an address service refusing us for exceeding its policy.
 *
 * Deliberately in memory, and deliberately honest about what that buys.
 *
 * On Vercel each serverless instance has its own copy of this, so a caller
 * spread across many instances gets more through than the number below
 * suggests. That makes this a speed bump, not a wall — it stops a script
 * hammering one endpoint, which is the realistic threat to a stall, and it
 * does not stop a distributed flood. The wall belongs in front of the
 * application, in Vercel's own firewall, where it can drop traffic before it
 * costs anything. This is the layer that still works if that is misconfigured.
 *
 * A sliding window rather than a fixed one: a fixed window lets someone send
 * a full quota at 11:59:59 and another at 12:00:00, which is twice the limit
 * in a single second, precisely when it matters.
 */

type Window = { hits: number[] };

const windows = new Map<string, Window>();

/**
 * The cap on the map itself, which is the bug this file could easily have
 * become. A limiter keyed by something the caller chooses — an IP, a guest
 * key — grows with the number of distinct callers, so an attacker rotating
 * keys would exhaust memory through the very thing meant to protect it.
 * Oldest-first eviction keeps that bounded; a legitimate visitor evicted
 * early is simply allowed through, which is the right way to fail.
 */
const MAX_KEYS = 5_000;

export type Limit = { allowed: boolean; retryAfterMs: number };

export function rateLimit(key: string, max: number, windowMs: number): Limit {
  const now = Date.now();
  const cutoff = now - windowMs;

  let w = windows.get(key);
  if (!w) {
    if (windows.size >= MAX_KEYS) {
      // Map iteration is insertion-ordered, so the first key is the oldest.
      const oldest = windows.keys().next();
      if (!oldest.done) windows.delete(oldest.value);
    }
    w = { hits: [] };
    windows.set(key, w);
  }

  // Drop anything that has fallen out of the window before counting.
  w.hits = w.hits.filter((t) => t > cutoff);

  if (w.hits.length >= max) {
    const oldestHit = w.hits[0];
    return { allowed: false, retryAfterMs: Math.max(0, oldestHit + windowMs - now) };
  }

  w.hits.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Who is calling, as well as a server can tell.
 *
 * Behind Vercel the client address is in `x-forwarded-for`, first entry.
 * Spoofable in principle — but the proxy overwrites it, so what arrives here
 * is what the edge saw. Falling back to a single shared bucket when there is
 * no header is deliberate: unattributable traffic should share a limit rather
 * than get an unlimited one each.
 */
export function callerKey(request: Request, scope: string): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || "unknown";
  return `${scope}:${ip}`;
}

/** Test seam: the limiter is module state, and tests must not inherit it. */
export function resetRateLimits() {
  windows.clear();
}
