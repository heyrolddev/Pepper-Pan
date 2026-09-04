import Link from "next/link";

/**
 * What a second device sees instead of HQ.
 *
 * The screen has one job beyond refusing: telling the person what is
 * happening and what to do, in that order. "Access denied" on a phone the
 * person is holding, at a stall, mid-service, is the kind of message that
 * turns into a phone call to the owner — which is fine, and is exactly why
 * the message says to make that call rather than leaving them to guess.
 *
 * No auto-refresh. Once the owner approves it, reloading works, and a page
 * that reloads itself every few seconds while somebody reads it is worse
 * than a button.
 */
export function DeviceWaiting({ declined }: { declined: boolean }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <p className="text-4xl">{declined ? "🚫" : "🔐"}</p>
        <h2 className="mt-4 font-display text-2xl font-black tracking-tight text-ink-950">
          {declined
            ? "This device isn't allowed"
            : "Waiting for the owner to let this device in"}
        </h2>

        {declined ? (
          <p className="mt-3 text-sm leading-relaxed text-ink-800/75">
            The owner has said no to this browser. If that was a mistake — a
            new phone, or your own laptop — ask them to allow it from HQ →
            Staff.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-ink-800/75">
              Your account already works on another device, so this one has to
              be let in by the owner. They have been sent a notification.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-800/75">
              If it&apos;s urgent, tell them directly — they approve it in HQ →
              Staff, and it takes a second. Then reload this page.
            </p>
          </>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600"
          >
            Try again
          </Link>
          <Link
            href="/"
            className="rounded-full px-5 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950"
          >
            Back to the shop
          </Link>
        </div>
      </div>
    </div>
  );
}
