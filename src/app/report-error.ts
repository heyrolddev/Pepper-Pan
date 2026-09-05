"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { recordError } from "@/lib/error-log";

/**
 * An error that happened in somebody's browser, reported back.
 *
 * `onRequestError` catches everything that breaks on the server, which is most
 * of it — but not a component that throws while hydrating, or a click handler
 * that fails on one particular phone. Those only exist in the browser, and
 * until now they existed nowhere else at all.
 *
 * THIS ACTION IS CALLABLE BY ANYONE, and that shapes the whole of it. It is
 * reachable from the customer-facing error page, so it is reachable from a
 * script, so it is a way to write rows into the shop's database without
 * signing in. Three things keep that from mattering:
 *
 *   A hard rate limit per caller. Five a minute is far more than a person
 *   whose page just broke will ever produce, and far less than a script needs
 *   to be worth running.
 *
 *   Nothing the caller sends decides where the row goes. The message is
 *   truncated and the route is taken from the caller only as a label — the
 *   fingerprint is computed here, and every row lands in the same table with
 *   the same shape.
 *
 *   No response. Success and refusal look identical from outside, so this
 *   cannot be used to probe anything.
 */
export async function reportClientError(input: {
  message: string;
  route: string;
  digest?: string;
}): Promise<void> {
  const head = await headers();
  const ip = head.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = rateLimit(`client-error:${ip}`, 5, 60_000);
  if (!limit.allowed) return;

  const message = String(input.message ?? "").slice(0, 500);
  if (!message.trim()) return;

  // Rebuilt as a plain Error rather than passed through, so `recordError`
  // sees the same shape it sees from the server and the digest filter for
  // Next's redirect/not-found control flow applies here too.
  const error = Object.assign(new Error(message), {
    digest: input.digest ? String(input.digest).slice(0, 200) : undefined,
  });

  await recordError({
    error,
    route: String(input.route ?? "").slice(0, 200) || null,
    kind: "client",
  });
}
