"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { asPlainText, renderReceipt, type Receipt } from "@/lib/receipt";
import { chunk, encodeReceipt, toBase64 } from "@/lib/escpos";
import {
  bluetoothSupported,
  connectPrinter,
  sendJob,
  type Connection,
} from "@/lib/bluetooth-printer";

/** These never change while the page is open, so there is nothing to watch. */
const never = () => () => {};
const offOnServer = () => false;
const onAndroid = () => /android/i.test(navigator.userAgent);

/**
 * Printing a receipt from the till.
 *
 * Three routes, because there is no single one that works on every phone the
 * shop's staff might be holding:
 *
 *   Bluetooth  — direct, if the browser allows it AND the printer is Low
 *                Energy. Best experience: tap once, paper comes out.
 *   RawBT      — Android only, for Bluetooth CLASSIC printers, which browsers
 *                cannot reach at all. A free helper app does the talking.
 *   Print      — the browser's own print dialog, against a 58mm page. Works
 *                anywhere, including where a printer is installed on a laptop.
 *
 * Whichever is available is offered; the rest are not shown. The receipt
 * itself is always on screen, so even where nothing can print there is
 * something to read out or photograph — a till that can take money but cannot
 * show a customer what they were charged is worse than one with no printer.
 */
export function ReceiptPrinter({
  receipt,
  onDone,
}: {
  receipt: Receipt;
  onDone?: () => void;
}) {
  const rows = renderReceipt(receipt);
  const text = asPlainText(rows);

  const [conn, setConn] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paper = useRef<HTMLPreElement>(null);

  // What this particular browser can do is a fact about the world outside
  // React, so it is read as one. Setting it from an effect instead would
  // render the wrong buttons first and then correct them — and would make the
  // server and the client disagree on the way past.
  const canBluetooth = useSyncExternalStore(never, bluetoothSupported, offOnServer);
  const isAndroid = useSyncExternalStore(never, onAndroid, offOnServer);

  async function printOverBluetooth() {
    setError(null);
    setBusy(true);
    try {
      // Connect once and keep it for the shift. Making somebody pick their
      // printer out of a list for every single sale is not a till.
      const open = conn?.isOpen() ? conn : await connectPrinter();
      setConn(open);
      await sendJob(open, chunk(encodeReceipt(rows)));
      setNote(`Printed on ${open.name}.`);
      onDone?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // A cancelled chooser is not a failure, it is a person changing their
      // mind, and it should not paint the screen red.
      setError(/cancel|User cancelled/i.test(message) ? null : message);
      setConn(null);
    } finally {
      setBusy(false);
    }
  }

  const rawbtHref = `rawbt:base64,${toBase64(encodeReceipt(rows))}`;

  return (
    <div className="flex flex-col gap-4">
      {/* The receipt itself, as it will come out. Monospaced and 32 columns
          wide, so what is on the screen is what is on the paper. */}
      <pre
        ref={paper}
        id="receipt-paper"
        className="receipt-paper overflow-x-auto rounded-2xl bg-cream-50 px-4 py-5 font-mono text-[12.5px] leading-[1.45] text-ink-950 ring-1 ring-ink-950/15"
      >
        {text.join("\n")}
      </pre>

      <div className="flex flex-wrap gap-2">
        {canBluetooth && (
          <button
            onClick={printOverBluetooth}
            disabled={busy}
            className="rounded-2xl bg-ink-950 px-5 py-3 font-bold text-gold-400 transition-transform hover:scale-105 disabled:opacity-50"
          >
            {busy
              ? "Printing…"
              : conn?.isOpen()
                ? `Print on ${conn.name}`
                : "Connect a printer & print"}
          </button>
        )}

        <button
          onClick={() => window.print()}
          className="rounded-2xl bg-ink-950/5 px-5 py-3 font-bold text-ink-800 transition-colors hover:bg-ink-950/10"
        >
          Print dialog
        </button>

        {isAndroid && (
          // For Bluetooth CLASSIC printers, which no browser can reach. RawBT
          // is a free app that takes the job and does the talking.
          <a
            href={rawbtHref}
            className="rounded-2xl bg-ink-950/5 px-5 py-3 font-bold text-ink-800 transition-colors hover:bg-ink-950/10"
          >
            Send to RawBT
          </a>
        )}

        {conn?.isOpen() && (
          <button
            onClick={() => {
              conn.disconnect();
              setConn(null);
              setNote(null);
            }}
            className="rounded-2xl px-4 py-3 text-sm font-bold text-ink-800/60 hover:text-brand-600"
          >
            Disconnect
          </button>
        )}
      </div>

      {note && <p className="text-sm font-semibold text-jade-700">{note}</p>}
      {error && (
        <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      {!canBluetooth && (
        <p className="text-xs text-ink-800/50">
          This browser can&apos;t reach a Bluetooth printer. On iPhone and iPad
          no browser can — use the print dialog, or ring up on an Android phone
          when you want paper.
        </p>
      )}
    </div>
  );
}
