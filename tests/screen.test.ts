import test from "node:test";
import assert from "node:assert/strict";

import { applyOrientationLock, isScreenMode, readScreenMode } from "../src/lib/screen.ts";

/**
 * The setting that worked once and then appeared to break.
 *
 * Picking "Landscape" in My account turned the phone. Closing the installed
 * app and opening it again restored the wide LAYOUT — shorter header,
 * compressed masthead — and did not turn the phone, because the lock was
 * taken in the button's click handler and nowhere else. The only cure was to
 * walk back into My account and press a button that was already selected.
 *
 * No iPhone ever showed it: `screen.orientation.lock` does not exist there,
 * so it never rotated on the first tap either and there was no working
 * behaviour to lose. Android has the call, honours it in an installed app,
 * and therefore had the bug to itself.
 *
 * `<ScreenLock>` in the root layout is the fix for WHEN it is called. These
 * are about WHAT IT SAYS BACK — because the second half of the bug was that
 * a refusal was swallowed by a bare `catch {}` while the control went on
 * telling the visitor "Landscape turns the screen itself".
 */

type FakeOrientation = {
  lock?: (o: string) => Promise<void>;
  unlock?: () => void;
};

/** Stand a browser up around the module for one call, then take it down. */
async function withScreen(
  orientation: FakeOrientation | undefined,
  mode: "auto" | "wide"
) {
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  const previous = g.window;
  g.window = { screen: orientation ? { orientation } : {} };
  try {
    return await applyOrientationLock(mode);
  } finally {
    if (had) g.window = previous;
    else delete g.window;
  }
}

test("an installed Android that takes the lock reports it was locked", async () => {
  const asked: string[] = [];
  const result = await withScreen(
    {
      lock: async (o) => {
        asked.push(o);
      },
    },
    "wide"
  );
  assert.equal(result, "locked");
  assert.deepEqual(asked, ["landscape"], "must ask for landscape, not portrait");
});

test("a browser tab that refuses the lock reports refused, not locked", async () => {
  // This is the case the old `catch {}` erased. Chrome in a tab rejects with
  // a NotSupportedError; the control was still telling the visitor the screen
  // would turn.
  const result = await withScreen(
    { lock: async () => Promise.reject(new Error("NotSupportedError")) },
    "wide"
  );
  assert.equal(result, "refused");
});

test("an iPhone, which has no lock at all, reports unsupported rather than refused", async () => {
  // The difference is what the visitor is told. "This browser won't let a
  // website turn the screen — add it to your home screen and it will" is
  // useful advice on Android and a lie on an iPhone, where no amount of
  // installing produces a `lock`.
  const result = await withScreen({ unlock: () => {} }, "wide");
  assert.equal(result, "unsupported");
});

test("a device with no screen.orientation at all is unsupported", async () => {
  assert.equal(await withScreen(undefined, "wide"), "unsupported");
});

test("choosing Portrait releases the lock and says so", async () => {
  let unlocked = 0;
  const result = await withScreen({ lock: async () => {}, unlock: () => { unlocked += 1; } }, "auto");
  assert.equal(result, "unlocked");
  assert.equal(unlocked, 1, "Portrait must actually release a lock, not just relabel it");
});

test("Portrait still reports unlocked when the browser throws on unlock", async () => {
  // Nothing was locked, or this browser will not say. The visitor asked for
  // "follows how you hold it" and that is what they have either way.
  const result = await withScreen(
    {
      unlock: () => {
        throw new Error("InvalidStateError");
      },
    },
    "auto"
  );
  assert.equal(result, "unlocked");
});

test("the stored value is validated, so a hand-edited localStorage cannot pick a third mode", () => {
  assert.equal(isScreenMode("wide"), true);
  assert.equal(isScreenMode("auto"), true);
  assert.equal(isScreenMode("landscape"), false);
  assert.equal(isScreenMode(null), false);
  assert.equal(isScreenMode(""), false);
});

test("an unreadable preference is the default one, not an error", () => {
  const g = globalThis as { localStorage?: unknown };
  const had = "localStorage" in g;
  const previous = g.localStorage;
  g.localStorage = {
    getItem() {
      // Private browsing refuses outright. A shop's site is not the place to
      // make that a crash.
      throw new Error("SecurityError");
    },
  };
  try {
    assert.equal(readScreenMode(), "auto");
  } finally {
    if (had) g.localStorage = previous;
    else delete g.localStorage;
  }
});
