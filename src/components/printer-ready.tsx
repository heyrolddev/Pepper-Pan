"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { bluetoothSupported } from "@/lib/bluetooth-printer";
import * as store from "@/lib/printer-store";

/**
 * Getting the printer ready before anybody is waiting.
 *
 * THE PROBLEM THIS FIXES
 *
 * The only way to reach the printer used to be the receipt panel, and that
 * panel only exists after a sale has been rung up. So the first customer of
 * the day stood at the counter while somebody opened a Bluetooth chooser,
 * found the right device among the neighbours' phones, and waited for it to
 * pair. Every morning. The work was being done at the worst possible moment,
 * for no reason other than that there was nowhere else to do it.
 *
 * There is now. This sits on the till itself, with no order in sight, so
 * pairing happens with the pans — and the till comes up already connected
 * where the browser can manage it.
 *
 * WHY THERE IS STILL A BUTTON
 *
 * `requestDevice` may only be called from a real tap. That is a browser rule
 * and a good one: a page that could silently enumerate the Bluetooth around
 * it would be a page that knows which shop you are standing in. So the first
 * pairing on a given device is always one tap. After that,
 * `navigator.bluetooth.getDevices()` can bring the same printer back with no
 * prompt at all — and that call is still behind a Chrome flag, so it is tried
 * and quietly given up on rather than depended upon.
 *
 * WHY TEST PRINT EARNS ITS PLACE
 *
 * Connected is not working. A printer can pair, report itself connected, and
 * produce nothing: out of paper, roll in backwards, Bluetooth Classic
 * underneath. The only proof is paper coming out, and prep is when you want
 * to find that out.
 */

const never = () => () => {};
const offOnServer = () => false;

export function PrinterReady() {
  const canBluetooth = useSyncExternalStore(never, bluetoothSupported, offOnServer);
  useSyncExternalStore(store.subscribe, store.getVersion, store.versionOnServer);
  const auto = useSyncExternalStore(store.subscribe, store.autoPrint, store.autoPrintOnServer);

  const [busy, setBusy] = useState<null | "connect" | "test">(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const connected = store.isConnected();
  const name = store.printer()?.name ?? null;

  /**
   * Wake the usual printer as soon as the till opens.
   *
   * Needs no tap — a permission already granted does not prompt again — and
   * never opens a chooser, so the worst case is that nothing happens and the
   * Connect button is still sitting there. Runs once; a till left open all
   * day should not be reaching for the Bluetooth stack on every render.
   */
  useEffect(() => {
    let alive = true;
    store
      .reconnect()
      .catch(() => false)
      .finally(() => {
        if (alive) setTried(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!canBluetooth) {
    return (
      <Shell tone="plain">
        <p className="text-sm leading-relaxed text-ink-800/70">
          <strong className="text-ink-950">This device can&apos;t pair a printer.</strong>{" "}
          Browsers on iPhone and iPad have no Bluetooth at all. Receipts can
          still be printed after each sale — through the RawBT app on Android,
          or the browser&apos;s own print dialog.
        </p>
      </Shell>
    );
  }

  async function connect() {
    setError(null);
    setNote(null);
    setBusy("connect");
    try {
      const open = await store.connect();
      setNote(`${open.name} is ready.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Somebody closing the chooser changed their mind. That is not a fault
      // and must not paint the counter red.
      setError(/cancel|User cancelled/i.test(message) ? null : message);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setError(null);
    setNote(null);
    setBusy("test");
    const res = await store.testPrint();
    if (res.status === "printed") setNote("Test slip sent — check the paper.");
    else if (res.status === "failed") setError(res.message);
    else setError("The printer went away. Connect it again.");
    setBusy(null);
  }

  return (
    <Shell tone={connected ? "ready" : "plain"}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-jade-500" : "bg-ink-950/25"
            }`}
            aria-hidden="true"
          />
          <span className="text-sm font-black text-ink-950">
            {connected ? `Printer ready — ${name}` : "Printer not connected"}
          </span>
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {connected ? (
            <>
              <button
                onClick={test}
                disabled={busy !== null}
                className="rounded-xl bg-ink-950 px-4 py-2 text-xs font-black text-cream-50 hover:bg-ink-800 disabled:opacity-50"
              >
                {busy === "test" ? "Printing…" : "Test print"}
              </button>
              <button
                onClick={() => {
                  store.disconnect();
                  setNote(null);
                  setError(null);
                }}
                className="rounded-xl px-3 py-2 text-xs font-bold text-ink-800/50 hover:text-brand-700"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              disabled={busy !== null}
              className="rounded-xl bg-ink-950 px-4 py-2 text-xs font-black text-cream-50 hover:bg-ink-800 disabled:opacity-50"
            >
              {busy === "connect"
                ? "Pairing…"
                : store.hasPairedBefore()
                  ? "Wake the printer"
                  : "Connect a printer"}
            </button>
          )}
        </div>
      </div>

      {/* The auto-print switch belongs here as much as on the receipt: this is
          the moment somebody is setting the counter up for the day, and it is
          the same stored value either way, so the two can never disagree. */}
      <label className="flex items-center gap-2.5 text-xs text-ink-800/70">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => store.setAutoPrint(e.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
        Print every sale automatically
      </label>

      {error && (
        <p className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-cream-50">
          {error}
        </p>
      )}
      {note && !error && (
        <p className="text-xs font-bold text-jade-700">{note}</p>
      )}

      {/* Only once the silent attempt has been made and failed, so a till that
          reconnects by itself never shows advice it does not need. */}
      {!connected && tried && store.hasPairedBefore() && (
        <p className="text-[11px] leading-relaxed text-ink-800/50">
          {store.remembersPrinters()
            ? "Switch the printer on and tap Wake — it should come back without asking which one."
            : "This browser can't remember printers between visits, so it needs the one tap each morning."}
        </p>
      )}
    </Shell>
  );
}

function Shell({
  tone,
  children,
}: {
  tone: "ready" | "plain";
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label="Receipt printer"
      className={`flex flex-col gap-3 rounded-2xl p-4 ring-1 ${
        tone === "ready"
          ? "bg-jade-600/8 ring-jade-600/25"
          : "bg-cream-100 ring-ink-950/10"
      }`}
    >
      {children}
    </section>
  );
}
