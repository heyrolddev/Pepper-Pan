/**
 * Turning a receipt into the bytes a thermal printer understands.
 *
 * ESC/POS is a command language from the 1990s that essentially every thermal
 * printer still speaks — you send it plain text with the occasional escape
 * sequence for "centre this", "make this big", "cut the paper". It is why a
 * ₱1,200 printer from the palengke and a ₱30,000 one from a supplier both
 * accept the same job.
 *
 * Pure: bytes in, bytes out, no browser. That means the encoder can be tested
 * without a printer in the room, which matters — the alternative is finding out
 * a command is wrong by feeding paper.
 */

import type { ReceiptRow } from "@/lib/receipt";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type Align = "left" | "centre" | "right";

/** Builds the byte stream one command at a time. */
class Job {
  private parts: number[] = [];

  raw(...bytes: number[]): this {
    this.parts.push(...bytes);
    return this;
  }

  /**
   * Text, encoded one byte per character.
   *
   * The caller is expected to have folded the text to ASCII already — see
   * `toPrinterAscii`. Anything above 0x7e is dropped here rather than sent,
   * because a byte the printer's code page doesn't recognise is not a
   * character it fails to print, it is a character it prints as something
   * else entirely.
   */
  text(s: string): this {
    for (const ch of s) {
      const code = ch.charCodeAt(0);
      this.parts.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
    }
    return this;
  }

  line(s = ""): this {
    return this.text(s).raw(LF);
  }

  /** ESC @ — forget whatever the last job left set. */
  init(): this {
    return this.raw(ESC, 0x40);
  }

  align(a: Align): this {
    return this.raw(ESC, 0x61, a === "centre" ? 1 : a === "right" ? 2 : 0);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** GS ! — 0 is normal; 0x11 is double width and height. */
  big(on: boolean): this {
    return this.raw(GS, 0x21, on ? 0x11 : 0x00);
  }

  feed(lines = 1): this {
    return this.raw(ESC, 0x64, lines);
  }

  /**
   * GS V — cut.
   *
   * Sent last, after a feed, because the blade sits a couple of centimetres
   * past the print head: cutting without feeding first slices through the
   * bottom of the receipt you just printed.
   */
  cut(): this {
    return this.feed(4).raw(GS, 0x56, 0x00);
  }

  done(): Uint8Array {
    return new Uint8Array(this.parts);
  }
}

/**
 * A whole receipt, ready to send.
 *
 * The shop's name is set large and centred; the body is plain. That is the
 * whole of the styling, on purpose — a thermal receipt that tries to be
 * designed comes out as a smudge, and the only thing a customer needs to find
 * at a glance is which stall it came from and what the total was.
 */
export function encodeReceipt(
  rows: ReceiptRow[],
  opts: { cut?: boolean } = {}
): Uint8Array {
  const job = new Job().init();

  for (const r of rows) {
    job.align(r.align === "centre" ? "centre" : "left");
    if (r.big) job.big(true).bold(true);
    job.line(r.text);
    if (r.big) job.big(false).bold(false);
  }

  job.align("left");
  return opts.cut === false ? job.feed(4).done() : job.cut().done();
}

/**
 * Bluetooth Low Energy will not take a receipt in one write.
 *
 * A characteristic accepts something like 20 to 512 bytes at a time depending
 * on what the two devices negotiated, and a printer that is given more than it
 * agreed to will either drop the rest or hang mid-receipt. Splitting small and
 * pausing between chunks is slower and it finishes; sending it all at once is
 * faster and prints half a receipt.
 */
export function chunk(bytes: Uint8Array, size = 180): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

/** For the Android helper-app route, which takes the job as base64 in a URL. */
export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
