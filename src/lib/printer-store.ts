"use client";

import {
  canRemember,
  connectPrinter,
  onPrinterLost,
  reconnectPrinter,
  sendJob,
  type Connection,
} from "@/lib/bluetooth-printer";
import { chunk, encodeReceipt } from "@/lib/escpos";
import { renderReceipt, testSlip, type Receipt } from "@/lib/receipt";

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
let stopWatching: (() => void) | null = null;
const listeners = new Set<() => void>();

/**
 * Which printer this counter uses, remembered per device.
 *
 * Per browser rather than per account, for the same reason auto-print is: it
 * describes a counter, not a person. The tablet by the pan has a printer
 * beside it; the owner's phone does not.
 */
const DEVICE_KEY = "pepperpan.printer.id";

function rememberDevice(id: string) {
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // A browser refusing storage costs the silent reconnect, not the printer.
  }
}

function rememberedDevice(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

/**
 * Hold on to a connection, and notice when it goes.
 *
 * A printer switched off, carried away or left to sleep does not tell the
 * page — the connection just stops working. Without the watch the till goes
 * on showing "Ready" over a printer in a drawer, and the first anybody knows
 * is a sale that did not print in front of a customer.
 */
function hold(next: Connection) {
  stopWatching?.();
  conn = next;
  rememberDevice(next.id);
  stopWatching = onPrinterLost(next, () => {
    if (conn === next) {
      conn = null;
      changed();
    }
  });
  changed();
}

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
  hold(await connectPrinter());
  return conn!;
}

/**
 * Wake the till's usual printer, without asking anybody anything.
 *
 * The morning case, and the reason this exists: the counter used to be able
 * to reach the printer only from the receipt panel, which only appears after
 * a sale — so the first customer of the day stood there while somebody picked
 * a printer out of a chooser. Prep now happens during prep.
 *
 * Safe to call on every load. It needs no tap (a permission already granted
 * does not prompt again), it returns false rather than throwing when the
 * printer is off or the browser cannot remember devices, and it never opens a
 * chooser — so the worst case is silence and a Connect button still waiting.
 */
export async function reconnect(): Promise<boolean> {
  if (conn?.isOpen()) return true;
  if (!canRemember()) return false;
  const id = rememberedDevice();
  if (!id) return false;

  const back = await reconnectPrinter(id);
  if (!back) return false;
  hold(back);
  return true;
}

/** Whether this browser could reconnect by itself, given a printer it knows. */
export const remembersPrinters = canRemember;

/** True once a printer has been paired here — even if it is not on right now. */
export function hasPairedBefore(): boolean {
  return rememberedDevice() !== null;
}

export function disconnect() {
  stopWatching?.();
  stopWatching = null;
  conn?.disconnect();
  conn = null;
  changed();
}

/**
 * A short slip that proves the paper comes out.
 *
 * Connecting is not the same as working. A printer can pair, report itself
 * connected, and still produce nothing — out of paper, roll in backwards, the
 * wrong kind of Bluetooth underneath. The only proof is paper, and the moment
 * to find out is during prep, not in front of the first customer.
 *
 * Deliberately does not look like a receipt. A test slip that resembles one
 * ends up in a customer's hand or, worse, in the shift's paperwork.
 */
export async function testPrint(): Promise<PrintResult> {
  const open = conn?.isOpen() ? conn : null;
  if (!open) return { status: "no-printer" };

  const rows = testSlip(open.name, new Date());

  try {
    await sendJob(open, chunk(encodeReceipt(rows)));
    return { status: "printed", name: open.name };
  } catch (e) {
    return { status: "failed", message: e instanceof Error ? e.message : String(e) };
  }
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

/* ---------------- whether the strip is folded away ---------------- */

const HIDDEN_KEY = "pepperpan.printer.hidden";
let hidden: boolean | null = null;

export const panelHiddenOnServer = () => false;

/**
 * Whether the counter's printer strip is folded to one line.
 *
 * Per device, like auto-print and for the same reason: it describes this
 * counter's screen, not the person looking at it. Read through
 * useSyncExternalStore, never during render — the server would say "showing"
 * and the browser "folded", and React throws the tree away over that.
 */
export function panelHidden(): boolean {
  if (hidden === null) {
    try {
      hidden = localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
      hidden = false;
    }
  }
  return hidden;
}

export function setPanelHidden(on: boolean) {
  hidden = on;
  try {
    localStorage.setItem(HIDDEN_KEY, on ? "1" : "0");
  } catch {
    // Not remembering it past this tab is a smaller loss than refusing it.
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
