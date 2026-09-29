import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The image cache is set to a year, and that is only safe because of
 * something in a completely different file.
 *
 * Next re-transforms an image when its cache entry expires, and every
 * transformation is billed. The default is four hours, so one menu photo is
 * re-processed six times a day for ever, whether or not anybody looked at
 * it. A year stops that.
 *
 * A long cache is normally how you end up serving last month's photograph.
 * It is safe HERE because every upload writes to a NEW path — so a changed
 * photo is a changed URL and there is nothing behind the old one to go
 * stale. That reasoning lives in `next.config.ts`, and the code it depends
 * on lives in four other files that know nothing about it.
 *
 * Which is exactly the kind of coupling that breaks quietly: somebody
 * writes an upload that reuses a path, everything works in testing because
 * the cache is cold, and a month later the shop changes a dish photo and
 * customers keep seeing the old one. Nothing would point at this config.
 */

const root = path.join(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("every upload path is unique, which is what makes the long cache safe", () => {
  // Each entry is a real upload call site and the thing that makes its path
  // new every time. A path built from an id ALONE would be reused on the
  // second upload, and that is the one this is looking for.
  const uploads: { file: string; needs: RegExp }[] = [
    // A dish photo: the meal id would repeat, the timestamp does not.
    { file: "src/app/admin/menu/actions.ts", needs: /meals\/\$\{mealId\}-\$\{Date\.now\(\)\}/ },
    // Promo and news media.
    { file: "src/app/admin/promos/actions.ts", needs: /crypto\.randomUUID\(\)/ },
    // A customer's proof of payment.
    { file: "src/app/orders/actions.ts", needs: /\$\{orderId\}-\$\{Date\.now\(\)\}/ },
  ];

  for (const u of uploads) {
    assert.match(
      read(u.file),
      u.needs,
      `${u.file} no longer builds a fresh path for each upload. ` +
        `next.config.ts caches transformed images for a YEAR on the basis ` +
        `that it does — reusing a path means customers keep seeing the old ` +
        `photo. Change one or the other, not neither.`
    );
  }
});

test("the cache is long enough to be worth the constraint above", () => {
  const cfg = read("next.config.ts");
  const m = cfg.match(/minimumCacheTTL:\s*([\d_]+)/);
  assert.ok(m, "next.config.ts sets no minimumCacheTTL, so images re-transform every four hours");
  const seconds = Number(m[1].replace(/_/g, ""));
  // A day would already beat the default sixfold; anything under that is
  // not worth carrying the uniqueness constraint for.
  assert.ok(
    seconds >= 86_400,
    `minimumCacheTTL is ${seconds}s — under a day, which does not justify the rule the test above enforces`
  );
});

test("the width lists stay short, because each width is a billed transform", () => {
  const cfg = read("next.config.ts");
  const widths = (name: string) => {
    const m = cfg.match(new RegExp(`${name}:\\s*\\[([^\\]]+)\\]`));
    assert.ok(m, `next.config.ts does not set ${name}, so Next uses its full default list`);
    return m[1].split(",").map((n) => Number(n.trim()));
  };

  const device = widths("deviceSizes");
  const image = widths("imageSizes");

  // The default is eight device widths up to 3840. Every one is a variant
  // Next may generate per photo, and the shop's plan counts them.
  assert.ok(device.length <= 6, `deviceSizes has ${device.length} widths`);
  assert.ok(image.length <= 5, `imageSizes has ${image.length} widths`);

  // 1200 earns its place: a 390px phone at three times the pixel density
  // asks for 1170, and without it that phone is handed 1920 — a bigger
  // download for most of the traffic, to save a transformation.
  assert.ok(device.includes(1200), "a high-density phone would be handed 1920");
  // 640 is the floor every `sizes` hint in the app lands on or above.
  assert.ok(device.includes(640), "the smallest common width is missing");
  // The widest fixed-size image in the app is 176px, which at twice the
  // density asks for 352 and needs the 384.
  assert.ok(Math.max(...image) >= 384, "a fixed-width image would fall through to a device width");
});
