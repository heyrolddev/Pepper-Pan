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

export type ReceiptLine = {
  name: string;
  /**
   * The kitchen code — "C1", "J3".
   *
   * Printed straight after the quantity, at the left edge, because that is
   * where a cook's eye goes down a ticket. The code is the shop's own
   * shorthand for the exact dish, so it distinguishes the La from the XL
   * where the name alone reads almost the same at arm's length over a wok.
   */
  code?: string | null;
  qty: number;
  price: number;
  /**
   * What ONE of it works out to, the dish and everything added to it.
   *
   * Null when any part of it is unknown — a dish with a half-filled recipe,
   * or an add-on nobody has costed. Null rather than a partial sum, for the
   * reason the whole feature is built on: a total made of most of a recipe
   * is not a low estimate, it is a wrong number with a calorie sign in
   * front of it, and a customer counting theirs would be misled by it.
   */
  nutrition?: Nutrition | null;
  /**
   * What was added to it, each on its own priced row underneath.
   *
   * Their own rows rather than folded into `price`, so the paper adds up: a
   * customer who reads "1 x Pork Solo Rice 135.00" against a ₱120 menu board
   * has a question, and the person who has to answer it is standing at a
   * stall with a queue behind them.
   */
  extras?: { label: string; price: number }[];
};

/**
 * One line of the receipt, with its alignment stated rather than implied.
 *
 * The first version returned plain strings and let the printer encoder work
 * out what was centred by looking for leading spaces. That is wrong the moment
 * a line is *indented* rather than centred — the "@ 149.00 each" under a
 * multiple — and it is wrong on paper, where nobody sees it until a customer
 * is holding it. Saying it outright costs one field.
 */
import { round, type Nutrition } from "./nutrition.ts";

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
  method: "cash" | "gcash" | "bank";
  /** Cash only: what was handed over, and what went back. */
  tendered?: number | null;
  change?: number | null;
  /** GCash and bank transfers — the number the payment can be traced by. */
  reference?: string | null;
  servedBy?: string | null;
  /** Who it is for. Printed so a bag on the counter can be handed over by
   *  name instead of by shouting a four-character reference across a queue. */
  customer?: string | null;
  /**
   * The owner's switch, the same one the customer's menu obeys.
   *
   * A receipt is customer-facing too, so a shop that has deliberately kept
   * calories off the menu must not find them on the paper. Off by default:
   * a receipt that grows a new block because somebody forgot to pass a flag
   * is the wrong direction to fail in.
   */
  showNutrition?: boolean;
};

/**
 * What a whole order works out to, and whether it can be said at all.
 *
 * `complete` is false the moment ONE line has no figure. The total is still
 * returned — it is the right number for the lines that are known — but the
 * paper has to say it is a floor rather than a total, because the customer
 * has no way to see which line was left out.
 */
export function receiptNutrition(lines: ReceiptLine[]): {
  total: Nutrition;
  complete: boolean;
  /** Lines that carry a figure at all. Zero means print nothing. */
  known: number;
} {
  let total: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let known = 0;
  let complete = true;

  for (const line of lines) {
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (qty <= 0) continue;
    if (!line.nutrition) {
      complete = false;
      continue;
    }
    known += 1;
    total = {
      kcal: total.kcal + line.nutrition.kcal * qty,
      protein: total.protein + line.nutrition.protein * qty,
      carbs: total.carbs + line.nutrition.carbs * qty,
      fat: total.fat + line.nutrition.fat * qty,
    };
  }

  return { total: round(total), complete, known };
}

/** "742 kcal" and "38P 61C 37F" — the shorthand the menu already uses. */
function macroText(n: Nutrition): string {
  return `${n.protein}P ${n.carbs}C ${n.fat}F`;
}

const kcalText = (n: number) => `${Math.round(n).toLocaleString("en-PH")} kcal`;

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
  out.push(mid("Taiwan-Style Food"));
  // The town first, the landmark after — a receipt gets read away from the
  // stall as often as at it, and "in front of Palengkeni" only helps someone
  // who already knows which town Palengkeni is in.
  out.push(mid("Apalit, Pampanga."));
  out.push(mid("(In front of Palengkeni,"));
  out.push(mid("beside Osave! - Apalit)"));
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

  const facts = receiptNutrition(r.lines);
  const showFacts = r.showNutrition === true && facts.known > 0;

  for (const line of r.lines) {
    const money = amount(line.price * line.qty);
    // The code sits between the quantity and the name, at the left edge,
    // because that is where a cook's eye goes down a ticket — and it is the
    // one string that tells a La from an XL without reading to the end of a
    // name that wraps.
    const head = `${line.qty} x ${line.code ? `${line.code} ` : ""}${line.name}`;
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
    for (const extra of line.extras ?? []) {
      out.push(left(row(`  + ${extra.label}`, amount(extra.price * line.qty), cols)));
    }
  }

  out.push(left(rule(cols, "=")));
  out.push(left(row("TOTAL (PHP)", amount(r.total), cols)));

  /* ── what's in it ──────────────────────────────────────────────────
     A note at the end, not a figure threaded through the items.

     It was under each line first, between the add-ons and the next dish,
     and that made the middle of the receipt hard to read: the part a
     customer scans for "did they charge me right" had a second kind of
     number running through it. Money belongs in the money column; this is
     a different question and it gets its own place to be asked.

     Per SERVING rather than per line, which is what "what's in this dish"
     means — and "each" says so wherever more than one was bought, so the
     figure and the order total below it cannot be read as disagreeing. */
  if (showFacts) {
    out.push(left(""));
    out.push(left(rule(cols)));
    out.push(left("WHAT'S IN IT"));

    for (const line of r.lines) {
      if (!line.nutrition) continue;
      const shown = round(line.nutrition);
      const name = `${line.code ? `${line.code} ` : ""}${line.name}`;
      // Wrapped, never cut. A dish that reads "Black Pep" on the note is a
      // dish nobody can match to the line above it.
      out.push(...wrap(name, cols).map(left));
      out.push(
        left(
          `  ${kcalText(shown.kcal)}  ${macroText(shown)}${line.qty > 1 ? " each" : ""}`
        )
      );
    }

    out.push(left(rule(cols)));
    /* Marked as a floor when any line had no figure behind it. A silent
       skip would print an authoritative number that is low by exactly the
       dish nobody has costed — which, for the one person on the receipt
       who reads it, is worse than printing nothing at all. */
    out.push(
      left(
        row(
          facts.complete ? "Whole order" : "At least",
          kcalText(facts.total.kcal),
          cols
        )
      )
    );
    out.push(left(row("Protein/Carbs/Fat", macroText(facts.total), cols)));
    if (!facts.complete) {
      out.push(left("Some items are not counted"));
    }
  }

  out.push(left(""));

  // Cash is the branch with tendered and change; anything else is a
  // reference. Written as three cases rather than "gcash or else cash",
  // which is what it was — a bank transfer printed "Paid by CASH" on the one
  // piece of paper the customer takes home and keeps.
  if (r.method === "cash") {
    out.push(left(row("Paid by", "CASH", cols)));
    if (r.tendered != null) out.push(left(row("Cash received", amount(r.tendered), cols)));
    if (r.change != null) out.push(left(row("Change", amount(r.change), cols)));
  } else {
    out.push(left(row("Paid by", r.method === "bank" ? "BANK" : "GCASH", cols)));
    if (r.reference) out.push(left(row("Reference", r.reference, cols)));
  }

  out.push(left(""));
  // Three languages, because the stall serves in three. The accent on "Xiè"
  // is folded away by toPrinterAscii below — a thermal printer has no byte for
  // it — so the paper reads "Xie xie". It is kept here so the intent survives
  // in the one place that decides what a receipt says.
  out.push(mid("Xiè xie, Thank you, Salamat po!"));
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

/**
 * A slip that proves paper comes out, before anybody is waiting for one.
 *
 * Connected is not the same as working: a printer can pair, report itself
 * connected and still produce nothing — out of paper, roll in backwards,
 * Bluetooth Classic underneath. The only proof is paper, and prep is when to
 * find that out rather than in front of the first customer.
 *
 * Deliberately shaped so it can never be mistaken for a receipt. It says so
 * in the second line, and it carries no reference, no items and no total —
 * because a convincing test slip ends up in somebody's hand, or worse, in the
 * shift's paperwork being counted as a sale.
 */
export function testSlip(printerName: string, at: Date): ReceiptRow[] {
  const when = at.toLocaleString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
  return [
    { text: "PRINTER TEST", align: "centre", big: true },
    { text: "not a receipt", align: "centre" },
    { text: "", align: "left" },
    { text: printerName, align: "left" },
    { text: when, align: "left" },
    { text: "", align: "left" },
    { text: "If you can read this, the", align: "left" },
    { text: "till is ready for service.", align: "left" },
  ];
}
