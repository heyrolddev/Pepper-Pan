"use client";

import { connectPrinter, sendJob, type Connection } from "@/lib/bluetooth-printer";
import { chunk, encodeReceipt } from "@/lib/escpos";
import { renderReceipt, type Receipt } from "@/lib/receipt";

/**
 * The printer connection, kept outside React.
 *
 * It used to live in the receipt panel's own state, which meant it lived
 * exactly as long as that panel: the panel is rendered inside the post-sale
 * confirmation, so clearing the confirmation to ring up the next customer
 * unmounted it and dropped the connection. Whoever was on the till would have
 * picked their printer out of a chooser again for every single sale.
 *
 * A module-level value survives that, because it is not owned by any
 * component. React is told about changes through `subscribe`, so a till that
 * is on screen still re-renders when the printer connects or goes away.
 *
 * One connection per browser tab, which is the right number: there is one
 * printer on the counter.
 */

let conn: Connection | null = null;
let version = 0;
const listeners = new Set<() => void>();

function changed() {
  version += 1;
  for (const l of listeners) l();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * A number, not the connection itself.
 *
 * useSyncExternalStore compares snapshots by identity and will loop forever if
 * a new object comes back each call. A counter is stable, cheap, and changes
 * exactly when something worth re-rendering for has happened; components read
 * the connection itself with `printer()`.
 */
export const getVersion = () => version;
export const versionOnServer = () => 0;

export const printer = () => conn;
export const isConnected = () => conn?.isOpen() ?? false;

export async function connect(): Promise<Connection> {
  // Reuse a live connection rather than opening the chooser over it.
  if (conn?.isOpen()) return conn;
  conn = await connectPrinter();
  changed();
  return conn;
}

export function disconnect() {
  conn?.disconnect();
  conn = null;
  changed();
}

/* ---------------- print automatically after a sale ---------------- */

const AUTO_KEY = "pepperpan.autoprint";
let auto: boolean | null = null;

/** The server has no localStorage, so it always answers "off". */
export const autoPrintOnServer = () => false;

/**
 * Whether a completed sale should print without being asked.
 *
 * Remembered per device, because it is a property of the till rather than of
 * the person: the counter laptop with the printer on it wants this on, and
 * the owner's phone checking figures at home does not.
 *
 * Read this through useSyncExternalStore, never by calling it during render.
 * The server would say off and the browser would say on, and React would
 * report a hydration mismatch and throw the tree away — which it did, until
 * it was routed through the store. Passing it through is what tells React the
 * two answers are allowed to differ.
 */
export function autoPrint(): boolean {
  if (auto === null) {
    try {
      auto = localStorage.getItem(AUTO_KEY) === "1";
    } catch {
      auto = false;
    }
  }
  return auto;
}

export function setAutoPrint(on: boolean) {
  auto = on;
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {
    // A browser refusing storage is not a reason to refuse the setting; it
    // just will not be remembered past this tab.
  }
  changed();
}

export type PrintResult =
  | { status: "printed"; name: string }
  | { status: "off" }
  | { status: "no-printer" }
  | { status: "failed"; message: string };

/**
 * Print a finished sale, if the till has been set up to.
 *
 * Deliberately never opens the device chooser. The chooser needs a real tap —
 * that is a browser rule, and a good one — so a sale that finds no connected
 * printer reports it and leaves the receipt on screen with its buttons, rather
 * than appearing to hang while a dialog waits somewhere for a gesture that is
 * not coming.
 */
export async function printSale(receipt: Receipt): Promise<PrintResult> {
  if (!autoPrint()) return { status: "off" };
  const open = conn?.isOpen() ? conn : null;
  if (!open) return { status: "no-printer" };

  try {
    await sendJob(open, chunk(encodeReceipt(renderReceipt(receipt))));
    return { status: "printed", name: open.name };
  } catch (e) {
    return { status: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}
