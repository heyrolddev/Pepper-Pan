import Link from "next/link";
import { getSchedule } from "@/lib/hours-server";

/**
 * "We're closed right now" — said once, at the top, before anyone fills a cart.
 *
 * Finding out at checkout that the shop shut an hour ago is the kind of thing
 * that loses an order for good. Saying it early, with the next opening and a
 * way to order ahead anyway, keeps it.
 */
export async function ShopStatusBanner() {
  const { state, settings, configured } = await getSchedule();
  if (!configured || state.isOpen) return null;

  const paused = !settings.accepting_orders;

  return (
    <div
      className={`px-6 py-3 text-center text-sm font-semibold ${
        paused ? "bg-brand-600 text-cream-50" : "bg-brand-600 text-cream-50"
      }`}
    >
      <span>{state.reason}</span>
      {state.opensNext && <span className="opacity-75"> · {state.opensNext}</span>}
      {!paused && (
        <>
          {" "}
          <Link href="/menu" className="underline underline-offset-2">
            Order ahead anyway →
          </Link>
        </>
      )}
    </div>
  );
}
