import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CATEGORY_COLOURS,
  CATEGORY_TONES,
  cardTone,
  clashingColours,
  paletteFor,
} from "../src/lib/categories.ts";

/**
 * Colours the eye can actually tell apart.
 *
 * The owner's words were "dapat iba iba ang kulay ng bawat category dapat
 * walang magkamuka" — and two pairs in the set this replaced genuinely were
 * alike. "Brown" was `ink-700`, charcoal with a hint of red, sitting ΔE 17.8
 * from black. "Teal" was `jade-800`, a darker green, ΔE 22.6 from green. On a
 * phone in daylight each pair read as one colour, which is the entire thing a
 * colour code is supposed to prevent.
 *
 * Nobody caught that by looking, so this does not look. It reads the real hex
 * values out of globals.css, converts them to Lab, and fails on any pair the
 * eye would merge. Add a colour and this is what tells you it is too close to
 * one already there.
 */

/* ---------------- the measuring ---------------- */

const css = readFileSync("src/app/globals.css", "utf8");

/** Every `--color-x-500: #hex;` in the stylesheet. */
const HEX = new Map<string, string>();
for (const m of css.matchAll(/--color-([a-z]+-\d+):\s*(#[0-9a-fA-F]{6})/g)) {
  HEX.set(m[1], m[2].toLowerCase());
}

/** The background token out of a class string like "bg-brand-600 text-cream-50". */
function bgHex(chip: string): string {
  const m = chip.match(/bg-([a-z]+-\d+)(?:\/\d+)?/);
  assert.ok(m, `no bg token in "${chip}"`);
  const hex = HEX.get(m![1]);
  assert.ok(hex, `--color-${m![1]} is not defined in globals.css`);
  return hex!;
}

function textHex(chip: string): string {
  const m = chip.match(/text-([a-z]+-\d+)/);
  assert.ok(m, `no text token in "${chip}"`);
  const hex = HEX.get(m![1]);
  assert.ok(hex, `--color-${m![1]} is not defined in globals.css`);
  return hex!;
}

const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function lab(h: string): [number, number, number] {
  const [r, g, b] = chan(h).map(lin);
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE(a: string, b: string): number {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, b2] = chan(h).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------- the checks ---------------- */

/** Under about this, two swatches stop reading as different colours. */
const ALIKE = 25;

test("no two category colours look the same", () => {
  const keys = CATEGORY_COLOURS;
  const bad: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = CATEGORY_TONES[keys[i]];
      const b = CATEGORY_TONES[keys[j]];
      const d = deltaE(bgHex(a.chip), bgHex(b.chip));
      if (d < ALIKE) bad.push(`${a.label}/${b.label} are ΔE ${d.toFixed(1)} apart`);
    }
  }
  assert.deepEqual(bad, [], bad.join("; "));
});

test("every chip's own label is readable on it", () => {
  // A colour nobody can read the word on is not a usable category colour,
  // however distinct it is from the others.
  for (const key of CATEGORY_COLOURS) {
    const tone = CATEGORY_TONES[key];
    const r = contrast(bgHex(tone.chip), textHex(tone.chip));
    assert.ok(r >= 4.5, `${tone.label} reads at only ${r.toFixed(1)}:1`);
  }
});

test("every colour has a name a person would use", () => {
  const labels = CATEGORY_COLOURS.map((k) => CATEGORY_TONES[k].label);
  assert.equal(new Set(labels).size, labels.length, `duplicate label in ${labels.join(", ")}`);
  for (const l of labels) assert.match(l, /^[A-Z][a-z]+$/, `"${l}" is not a plain colour name`);
});

test("the dot and the chip are the same colour", () => {
  // A category whose dot and chip disagree is two colours at once depending
  // on whether you have tapped it. That exact bug shipped once already.
  for (const key of CATEGORY_COLOURS) {
    const tone = CATEGORY_TONES[key];
    assert.equal(bgHex(tone.dot), bgHex(tone.chip), `${tone.label} dot ≠ chip`);
  }
});

/* ---------------- handing them out ---------------- */

test("uncoloured categories never collide", () => {
  // The old fallback hashed the name into the palette. With five uncoloured
  // categories that is about a 60% chance two land on the same colour — it
  // was stable, which is what it was written for, but stable is not distinct.
  const names = ["Chicken", "Drinks", "Rice", "Sides", "Milktea", "Coffee"];
  const out = paletteFor(names);
  const labels = names.map((n) => out.get(n)!.label);
  assert.equal(new Set(labels).size, names.length, labels.join(", "));
});

test("a colour the owner chose is never moved to make room", () => {
  const names = ["Chicken", "Drinks"];
  const known = new Map([["Drinks", "brand"]]);
  const out = paletteFor(names, known);
  assert.equal(out.get("Drinks")!.label, "Red", "the owner's pick was overruled");
  assert.notEqual(out.get("Chicken")!.label, "Red");
});

test("every category gets a colour, even past the end of the palette", () => {
  const names = Array.from({ length: CATEGORY_COLOURS.length + 3 }, (_, i) => `C${i}`);
  const out = paletteFor(names);
  assert.equal(out.size, names.length, "a category came back with no colour at all");
  for (const n of names) assert.ok(out.get(n), `${n} has no tone`);
});

test("running out of colours is reported, not hidden", () => {
  const names = Array.from({ length: CATEGORY_COLOURS.length + 2 }, (_, i) => `C${i}`);
  const clashes = clashingColours(names);
  assert.ok(clashes.length > 0, "two categories share a colour and nothing said so");
  for (const c of clashes) assert.ok(c.names.length >= 2);
});

test("a duplicate the owner picked by hand is named, both of them", () => {
  const known = new Map([
    ["Chicken", "jade"],
    ["Drinks", "jade"],
  ]);
  const clashes = clashingColours(["Chicken", "Drinks", "Rice"], known);
  assert.equal(clashes.length, 1);
  assert.equal(clashes[0].label, "Green");
  assert.deepEqual(clashes[0].names.sort(), ["Chicken", "Drinks"]);
});

test("a tidy menu reports no clash at all", () => {
  assert.deepEqual(clashingColours(["Chicken", "Drinks", "Rice"]), []);
});

test("an unknown stored colour falls back rather than blanking the chip", () => {
  // A colour key from an older version of the palette, or a hand-edited row.
  const out = paletteFor(["Chicken"], new Map([["Chicken", "chartreuse"]]));
  assert.ok(out.get("Chicken"), "an unknown colour produced no tone");
});

/* ---------------- what colour a card is ---------------- */

test("a dish in one category takes that category's colour", () => {
  const palette = paletteFor(["Chicken", "Drinks"]);
  const tone = cardTone(["Chicken"], palette);
  assert.equal(tone?.label, palette.get("Chicken")!.label);
});

test("a dish in two categories takes no colour", () => {
  // The owner's own rule, and the right one. Painting it with the first
  // category makes the colour depend on the order somebody typed the tags,
  // and claims the card is only half of what it is.
  const palette = paletteFor(["Chicken", "Rice"]);
  assert.equal(cardTone(["Chicken", "Rice"], palette), null);
});

test("a dish in no category takes no colour", () => {
  assert.equal(cardTone([], paletteFor([])), null);
  assert.equal(cardTone(null, paletteFor([])), null);
});

test("blank tags do not count towards the two-category rule", () => {
  // A dish saved with a trailing empty tag is still a one-category dish.
  const palette = paletteFor(["Chicken"]);
  assert.equal(cardTone(["Chicken", "  "], palette)?.label, palette.get("Chicken")!.label);
});

test("a category with no colour assigned yet leaves the card plain", () => {
  // Rather than throwing, or falling through to some default that would make
  // two unrelated dishes look related.
  assert.equal(cardTone(["Ghost"], paletteFor(["Chicken"])), null);
});
