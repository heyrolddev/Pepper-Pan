/**
 * Finding a receipt printer over Bluetooth, without being told which one it is.
 *
 * Web Bluetooth can only speak Bluetooth LOW ENERGY. It cannot speak Bluetooth
 * Classic (SPP), which is what a good number of cheap thermal printers use —
 * so this works with some printers and not others, and there is no code that
 * changes that. It is a limit of the browser.
 *
 * What this file does do is avoid needing the model number. Rather than
 * hard-coding one manufacturer's service UUID, it connects and then LOOKS:
 * walks the printer's services, finds a characteristic that accepts writes,
 * and uses it. The known UUIDs below are only there because Web Bluetooth
 * refuses to hand over a service that was not asked for by name — they widen
 * what the browser will let us see, they are not a whitelist of what works.
 */

/** Minimal Web Bluetooth surface. Declared here rather than pulling in a
 *  dependency for six interfaces the browser already implements. */
type Characteristic = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(v: BufferSource): Promise<void>;
  writeValueWithoutResponse?(v: BufferSource): Promise<void>;
};
type Service = { getCharacteristics(): Promise<Characteristic[]> };
type Server = { connected: boolean; getPrimaryServices(): Promise<Service[]>; disconnect(): void };
type Device = {
  /** Stable for as long as the permission lasts. What `getDevices` matches on. */
  id: string;
  name?: string;
  gatt?: { connect(): Promise<Server> };
  addEventListener(t: string, fn: () => void): void;
  removeEventListener?(t: string, fn: () => void): void;
};
type Bluetooth = {
  getAvailability?(): Promise<boolean>;
  requestDevice(o: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }): Promise<Device>;
  /** Devices this page already has permission for. Not in every build — see
   *  `knownPrinters`. */
  getDevices?(): Promise<Device[]>;
};

function bluetooth(): Bluetooth | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth ?? null;
}

/** Is this browser capable of it at all? False on every iPhone and iPad. */
export function bluetoothSupported(): boolean {
  return bluetooth() !== null;
}

/**
 * The services these printers are usually found behind.
 *
 * Not a compatibility list. Web Bluetooth hides any service a page did not
 * name in advance, so a printer whose service is missing here would connect
 * and then appear to have nothing on it. Adding a UUID costs nothing and
 * risks nothing; leaving one out looks exactly like a broken printer.
 */
const KNOWN_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // the common Chinese thermal module
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 style serial bridges
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip transparent UART
  "0000ae30-0000-1000-8000-00805f9b34fb",
];

/**
 * The device behind each live connection.
 *
 * Kept beside the connection rather than on it, because `Connection` is the
 * shape the rest of the app writes bytes through and it has no business
 * carrying a browser object around. Weak would be wrong here: the map IS what
 * keeps the device reachable for as long as the connection is.
 */
const DEVICES = new Map<string, Device>();

export type Connection = {
  /** The browser's own id for the device, so the same printer can be found
   *  again without asking the person which one it was. */
  id: string;
  name: string;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): void;
  isOpen(): boolean;
};

/**
 * Whether this browser can reconnect to a printer it already knows.
 *
 * `getDevices()` is the API that would let the till come back up in the
 * morning already paired, with no chooser at all. It is still behind a flag in
 * Chrome (`#enable-web-bluetooth-new-permissions-backend`), so it is checked
 * for rather than assumed: where it exists the shop gets a silent reconnect,
 * and where it does not they get a one-tap Connect — which is still the thing
 * they asked for, just with the tap.
 */
export function canRemember(): boolean {
  return typeof bluetooth()?.getDevices === "function";
}

/**
 * Ask the person to pick their printer, then find something on it to write to.
 *
 * Must be called from a real tap. The browser will not open its device chooser
 * from code that no one asked for, which is the right rule and not a bug.
 */
export async function connectPrinter(): Promise<Connection> {
  const bt = bluetooth();
  if (!bt) throw new Error("This browser can't use Bluetooth. On iPhone and iPad, none can.");

  const device = await bt.requestDevice({
    // Every device, rather than only those advertising a known service: a
    // printer that advertises nothing recognisable would otherwise never
    // appear in the list, and the owner would conclude it was broken.
    acceptAllDevices: true,
    optionalServices: KNOWN_SERVICES,
  });

  return openDevice(device);
}

/**
 * Reconnect to a printer this browser has already been given permission for.
 *
 * No chooser, and — this is the part that makes it useful — no user gesture.
 * `requestDevice` needs a tap because it is a permission prompt;
 * `gatt.connect()` on a device already permitted does not, so the till can do
 * this by itself the moment the page opens.
 *
 * Returns null rather than throwing on every ordinary failure: the flag is
 * off, the permission was cleared, the printer is unplugged. None of those is
 * an error worth painting on a screen at seven in the morning — they all just
 * mean "still needs the tap".
 */
export async function reconnectPrinter(id: string): Promise<Connection | null> {
  const bt = bluetooth();
  if (!bt?.getDevices) return null;
  try {
    const known = await bt.getDevices();
    const device = known.find((d) => d.id === id);
    if (!device?.gatt) return null;
    return await openDevice(device);
  } catch {
    return null;
  }
}

/** Connect to a device already in hand, and find something on it to write to. */
async function openDevice(device: Device): Promise<Connection> {
  if (!device.gatt) throw new Error("That device doesn't accept connections from a browser.");
  const server = await device.gatt.connect();

  // Look for somewhere to write, rather than assuming where it is.
  const services = await server.getPrimaryServices();
  let target: Characteristic | null = null;
  for (const service of services) {
    for (const ch of await service.getCharacteristics()) {
      if (ch.properties.writeWithoutResponse || ch.properties.write) {
        target = ch;
        break;
      }
    }
    if (target) break;
  }

  if (!target) {
    server.disconnect();
    throw new Error(
      "Connected, but this device has nothing a browser may write to. It is most likely a Bluetooth Classic printer, which browsers cannot reach."
    );
  }

  DEVICES.set(device.id, device);

  const write = async (bytes: Uint8Array) => {
    // A copy, because some browsers detach the buffer after a write and a
    // second chunk sliced from the same array then sends nothing.
    const payload = new Uint8Array(bytes);
    if (target!.properties.writeWithoutResponse && target!.writeValueWithoutResponse) {
      await target!.writeValueWithoutResponse(payload);
    } else {
      await target!.writeValue(payload);
    }
  };

  return {
    id: device.id,
    name: device.name || "Printer",
    write,
    disconnect: () => server.disconnect(),
    isOpen: () => server.connected,
  };
}

/**
 * Tell me when this printer goes away.
 *
 * A thermal printer switched off, carried out of range or left to sleep does
 * not announce itself to the page — the connection object simply stops
 * working. Without this the till goes on showing "Ready" over a printer that
 * is in a drawer, and the first anyone knows is a sale that does not print.
 *
 * Returns an unsubscribe, and tolerates a browser with no
 * `removeEventListener` on the device rather than assuming the full shape.
 */
export function onPrinterLost(conn: Connection, fn: () => void): () => void {
  const device = DEVICES.get(conn.id);
  if (!device) return () => {};
  device.addEventListener("gattserverdisconnected", fn);
  return () => device.removeEventListener?.("gattserverdisconnected", fn);
}


/**
 * Send a whole job, in pieces, with a breath between them.
 *
 * The pause is not superstition: a printer that is handed the next chunk
 * before it has finished the last one drops it, and the receipt comes out
 * missing its middle. Slow and complete beats fast and half-printed.
 */
export async function sendJob(
  conn: Connection,
  chunks: Uint8Array[],
  gapMs = 24
): Promise<void> {
  for (const part of chunks) {
    await conn.write(part);
    await new Promise((r) => setTimeout(r, gapMs));
  }
}
