"use client";

import { useEffect, useState } from "react";
import {
  savePushSubscription,
  removePushSubscription,
  sendTestPush,
} from "@/app/push/actions";

/**
 * The switch that lets the shop reach a phone with the browser closed.
 *
 * Notifications are a permission, and a permission asked at the wrong moment
 * is a permission denied forever — browsers remember a "block" and stop
 * asking. So nothing here happens on page load: the prompt appears only after
 * a deliberate tap on a button that has already said what it's for.
 */

/**
 * The VAPID public key travels as URL-safe base64 and has to reach
 * `pushManager.subscribe` as bytes.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  // Backed by a plain ArrayBuffer rather than the generic ArrayBufferLike,
  // which is what `applicationServerKey` will accept.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** "Chrome on Android" — enough to tell one device from another, no more. */
function describeDevice(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iPhone"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : "this device";
  return `${browser} on ${os}`;
}

function isApple(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Safari only allows notifications once the site lives on the home screen. */
function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

type State =
  | "checking"
  | "unsupported"
  | "needs-install"
  | "blocked"
  | "off"
  | "on";

export function PushToggle({
  vapidKey,
  audience,
}: {
  /** Null when the shop hasn't generated a keypair yet. */
  vapidKey: string | null;
  audience: "owner" | "customer";
}) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        // On an iPhone this is the *normal* state for a site opened in
        // Safari, not a broken browser — so say the useful thing.
        if (!cancelled) setState(isApple() ? "needs-install" : "unsupported");
        return;
      }
      if (isApple() && !isInstalled()) {
        if (!cancelled) setState("needs-install");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    if (!vapidKey) return;
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // An existing subscription may have been made against a different key
      // (the shop rotated it, or this is a stale one). Reusing it would mean
      // pushes that silently never arrive, so start clean.
      const stale = await reg.pushManager.getSubscription();
      if (stale) await stale.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        // Chrome refuses a subscription that could deliver a push without
        // showing anything, and it's the honest setting anyway: every push
        // this shop sends is meant to be seen.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const keys = sub.toJSON().keys ?? {};
      const { error: saveError } = await savePushSubscription({
        endpoint: sub.endpoint,
        p256dh: keys.p256dh ?? "",
        auth: keys.auth ?? "",
        label: describeDevice(),
      });

      if (saveError) {
        // Don't leave the browser believing it's subscribed when the shop
        // has no way to reach it.
        await sub.unsubscribe();
        setError(saveError);
        return;
      }

      setState("on");
      setNote("Turned on. Sending a test now…");
      const test = await sendTestPush();
      setNote(
        test.error
          ? "Turned on — but the test didn't arrive. Check that notifications are allowed for this site."
          : "Turned on. Check your notifications for the test."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't turn notifications on for this device."
      );
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Couldn't turn it off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError(null);
    setNote(null);
    const { error: testError } = await sendTestPush();
    setNote(testError ? null : "Sent — check your notifications.");
    setError(testError);
    setBusy(false);
  }

  const copy =
    audience === "owner"
      ? {
          title: "New order alerts",
          blurb:
            "Your phone rings the moment an order comes in, even with the browser closed. It is the only way to hear about an order while you are cooking.",
        }
      : {
          title: "Order updates on your phone",
          blurb:
            "We will tell you the moment your food is ready, even after you close the page — no need to keep checking back.",
        };

  return (
    <div className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-xl font-black text-ink-950">
            🔔 {copy.title}
          </p>
          <p className="mt-1 max-w-md text-sm text-ink-800/70">{copy.blurb}</p>
        </div>

        {state === "on" && (
          <span className="rounded-full bg-jade-700 px-3 py-1 text-xs font-bold text-cream-50">
            ON · this device
          </span>
        )}
      </div>

      <div className="mt-5">
        {!vapidKey ? (
          <p className="rounded-2xl bg-gold-400/20 p-4 text-sm text-ink-800/80">
            Not set up on the server yet. This needs a pair of{" "}
            <code className="font-mono text-xs">VAPID</code> keys in Vercel —
            free, no billing. The README has the two-line setup.
          </p>
        ) : state === "checking" ? (
          <p className="text-sm text-ink-800/50">Checking this device…</p>
        ) : state === "unsupported" ? (
          <p className="text-sm text-ink-800/70">
            This browser can&apos;t do notifications. Try Chrome on Android, or
            any browser on a computer.
          </p>
        ) : state === "needs-install" ? (
          <div className="rounded-2xl bg-cream-50 p-4 text-sm text-ink-800/80 ring-1 ring-ink-950/10">
            <p className="font-bold text-ink-950">
              On iPhone, install the site first.
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                Tap <strong>Share</strong> (the box with an arrow pointing up)
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>
              </li>
              <li>
                Open Pepper Pan from the home screen, come back here, and turn
                it on
              </li>
            </ol>
            <p className="mt-2 text-ink-800/60">
              That&apos;s Apple&apos;s rule, not ours — on Android and on a
              computer it works straight away.
            </p>
          </div>
        ) : state === "blocked" ? (
          <p className="rounded-2xl bg-brand-600/10 p-4 text-sm text-ink-800/80">
            Notifications are blocked for this site. Open the padlock 🔒 beside
            the address, find <strong>Notifications</strong>, choose{" "}
            <strong>Allow</strong>, then refresh.
          </p>
        ) : state === "on" ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={test}
              disabled={busy}
              className="rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-transform hover:scale-105 disabled:opacity-50"
            >
              Send a test
            </button>
            <button
              onClick={turnOff}
              disabled={busy}
              className="rounded-full px-5 py-2.5 text-sm font-bold text-ink-800/60 hover:text-brand-600 disabled:opacity-50"
            >
              Turn off on this device
            </button>
          </div>
        ) : (
          <button
            onClick={turnOn}
            disabled={busy}
            className="rounded-full bg-brand-600 px-6 py-3 font-bold text-cream-50 transition-transform hover:scale-105 disabled:opacity-50"
          >
            {busy ? "Setting up…" : "Turn on notifications"}
          </button>
        )}
      </div>

      {note && <p className="mt-3 text-sm text-jade-700">{note}</p>}
      {error && <p className="mt-3 text-sm text-brand-600">{error}</p>}

      {(state === "on" || state === "off") && vapidKey && (
        <p className="mt-4 text-xs text-ink-800/50">
          Each device is separate — to make another phone or tablet ring too,
          open this page there and turn it on as well.
        </p>
      )}
    </div>
  );
}
