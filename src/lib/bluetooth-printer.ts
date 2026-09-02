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
  name?: string;
  gatt?: { connect(): Promise<Server> };
  addEventListener(t: string, fn: () => void): void;
};
type Bluetooth = {
  getAvailability?(): Promise<boolean>;
  requestDevice(o: {
    acceptAllDevices?: boolean;
    optionalServices?: string[];
  }): Promise<Device>;
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

export type Connection = {
  name: string;
  write(bytes: Uint8Array): Promise<void>;
  disconnect(): void;
  isOpen(): boolean;
};

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
    name: device.name || "Printer",
    write,
    disconnect: () => server.disconnect(),
    isOpen: () => server.connected,
  };
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
