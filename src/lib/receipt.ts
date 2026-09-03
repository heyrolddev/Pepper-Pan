/**
 * What goes on a receipt, and how it sits on the paper.
 *
 * Pure and separate from anything that prints, because the same lines are
 * needed three different ways: sent to a Bluetooth printer as bytes, handed to
 * a helper app on Android, or laid out on screen for the browser's own print
 * dialog. One place decides what a Pepper Pan receipt says; three places show
 * it.
 *
 * A thermal roll is measured in characters, not pixels. 58mm paper fits 32
 * characters of the printer's normal font; 80mm fits 48. Everything here is
 * built to a column count rather than a width, which is why the receipt looks
 * right on either roll without a second layout.
 */

export type ReceiptLine = { name: string; qty: number; price: number };

/**
 * One line of the receipt, with its alignment stated rather than implied.
 *
 * The first version returned plain strings and let the printer encoder work
 * out what was centred by looking for leading spaces. That is wrong the moment
 * a line is *indented* rather than centred — the "@ 149.00 each" under a
 * multiple — and it is wrong on paper, where nobody sees it until a customer
 * is holding it. Saying it outright costs one field.
 */
export type ReceiptRow = {
  text: string;
  align: "left" | "centre";
  /** The shop's name, set large at the top. */
  big?: boolean;
};

export type Receipt = {
  /** The short reference the customer can quote. */
  ref: string;
  at: Date;
  lines: ReceiptLine[];
  total: number;
  /** Dine-in pays no packaging, and the receipt should say which it was. */
  dineIn: boolean;
  method: "cash" | "gcash";
  /** Cash only: what was handed over, and what went back. */
  tendered?: number | null;
  change?: number | null;
  /** GCash only. */
  reference?: string | null;
  servedBy?: string | null;
  /** Who it is for. Printed so a bag on the counter can be handed over by
   *  name instead of by shouting a four-character reference across a queue. */
  customer?: string | null;
};

export const COLUMNS = { narrow: 32, wide: 48 } as const;
export type RollWidth = keyof typeof COLUMNS;

/**
 * A thermal printer is not a browser.
 *
 * It renders one byte-per-character out of a code page — usually CP437 — and
 * anything outside it prints as a box, a random Greek letter, or nothing at
 * all. Which means the peso sign, the one character a Philippine receipt most
 * needs, is exactly the character that comes out as garbage.
 *
 * So the text is folded to plain ASCII before it is sent: ₱ becomes P, curly
 * quotes become straight ones, an em dash becomes a hyphen, and any accent is
 * dropped rather than printed as a smudge. It is not prettier. It is legible
 * on every printer instead of some of them.
 */
function toPrinterAscii(text: string): string {
  return text
    .replace(/₱/g, "P")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/×/g, "x")
    .replace(/•/g, "*")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
}

/** Money without the symbol — the symbol goes in the header, once. */
const amount = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mid = (text: string): ReceiptRow => ({ text, align: "centre" });
const left = (text: string): ReceiptRow => ({ text, align: "left" });

/**
 * Label on the left, figure hard against the right edge.
 *
 * Right-aligned money is the whole reason a receipt is readable at arm's
 * length: the pesos line up under the pesos. When the label is too long to
 * leave room, the label loses — never the figure.
 */
function row(label: string, value: string, cols: number): string {
  const gap = cols - value.length;
  const cut = label.length > gap - 1 ? label.slice(0, Math.max(0, gap - 1)) : label;
  return cut + " ".repeat(Math.max(1, gap - cut.length)) + value;
}

/** Wrap a long dish name rather than cutting it. Nobody ordered "Black Pep". */
function wrap(text: string, cols: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= cols) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

const rule = (cols: number, ch = "-") => ch.repeat(cols);

/**
 * The receipt, as plain lines.
 *
 * Returned as strings rather than as printer bytes so the same result can be
 * shown on a screen, checked in a test, or read out loud — and so that the one
 * place that decides what a receipt says has nothing to do with how it travels.
 */
export function renderReceipt(r: Receipt, width: RollWidth = "narrow"): ReceiptRow[] {
  const cols = COLUMNS[width];
  const out: ReceiptRow[] = [];

  out.push({ text: "PEPPER PAN", align: "centre", big: true });
  out.push(mid("Taiwan-Style Street Food"));
  out.push(mid("In front of Palengkeni,"));
  out.push(mid("beside Osave! - Apalit"));
  out.push(mid("+63 947 353 3060"));
  out.push(left(""));

  const when = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(r.at);

  out.push(left(row(when, r.dineIn ? "DINE-IN" : "TAKE-OUT", cols)));
  out.push(left(`Ref ${r.ref}`));
  // Above "served by": the customer's own name is the line they look for.
  if (r.customer) out.push(left(`For ${r.customer}`));
  if (r.servedBy) out.push(left(`Served by ${r.servedBy}`));
  out.push(left(rule(cols, "=")));

  for (const line of r.lines) {
    const money = amount(line.price * line.qty);
    const head = `${line.qty} x ${line.name}`;
    // A name that fits goes on one line with its price; one that doesn't gets
    // its own lines and the price under it, rather than being truncated.
    if (head.length + money.length + 1 <= cols) {
      out.push(left(row(head, money, cols)));
    } else {
      const wrapped = wrap(head, cols);
      out.push(...wrapped.slice(0, -1).map(left));
      out.push(left(row(wrapped[wrapped.length - 1], money, cols)));
    }
    if (line.qty > 1) out.push(left(`    @ ${amount(line.price)} each`));
  }

  out.push(left(rule(cols, "=")));
  out.push(left(row("TOTAL (PHP)", amount(r.total), cols)));
  out.push(left(""));

  if (r.method === "gcash") {
    out.push(left(row("Paid by", "GCASH", cols)));
    if (r.reference) out.push(left(row("Reference", r.reference, cols)));
  } else {
    out.push(left(row("Paid by", "CASH", cols)));
    if (r.tendered != null) out.push(left(row("Cash received", amount(r.tendered), cols)));
    if (r.change != null) out.push(left(row("Change", amount(r.change), cols)));
  }

  out.push(left(""));
  out.push(mid("Salamat po!"));
  out.push(mid("See you again"));
  out.push(left(""));
  // Not a BIR receipt, and the paper should be the thing that says so rather
  // than a customer finding out later.
  out.push(mid("This is not an official receipt"));

  return out.map((line) => ({ ...line, text: toPrinterAscii(line.text) }));
}

/**
 * The same receipt as padded lines, for a screen or a test.
 *
 * The printer centres a line itself, so `renderReceipt` leaves centred text
 * unpadded. Anything showing the receipt without a printer has to do that
 * padding, and this is the one place that does it.
 */
export function asPlainText(rows: ReceiptRow[], width: RollWidth = "narrow"): string[] {
  const cols = COLUMNS[width];
  return rows.map(({ text, align }) => {
    if (align !== "centre") return text;
    const t = text.slice(0, cols);
    return " ".repeat(Math.max(0, Math.floor((cols - t.length) / 2))) + t;
  });
}
