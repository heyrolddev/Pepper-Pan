import test from "node:test";
import assert from "node:assert/strict";
import { deviceLabel, DEVICE_COOKIE } from "../src/lib/devices.ts";

/**
 * Naming a device the owner has to make a decision about.
 *
 * The label is the whole basis for "is this my staff member's new phone, or
 * somebody else". A list where two devices are both "Unknown device" is a
 * list nobody can decide from, so the cases that collide in user-agent
 * strings are the ones worth pinning down.
 */

const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  firefoxMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  samsung:
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  ipad:
    "Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/604.1",
};

test("the phones staff actually use are named correctly", () => {
  assert.equal(deviceLabel(UA.chromeAndroid), "Chrome on Android");
  assert.equal(deviceLabel(UA.safariIphone), "Safari on iPhone");
  assert.equal(deviceLabel(UA.samsung), "Samsung Internet on Android");
  assert.equal(deviceLabel(UA.ipad), "Safari on iPad");
});

test("the strings that contain each other are told apart", () => {
  // Every one of these is a real collision: Edge's UA contains "Chrome",
  // Chrome's contains "Safari", Samsung's contains both. Checking the
  // general string first would label all of them Safari.
  assert.equal(deviceLabel(UA.edgeWindows), "Edge on Windows");
  assert.equal(deviceLabel(UA.chromeWindows), "Chrome on Windows");
  assert.equal(deviceLabel(UA.firefoxMac), "Firefox on Mac");
});

test("an iPad is not called a Mac", () => {
  // iPadOS reports "Macintosh" in some configurations and "iPad" in others.
  assert.equal(deviceLabel(UA.ipad), "Safari on iPad");
  assert.notEqual(deviceLabel(UA.ipad), "Safari on Mac");
});

test("no user agent is a name, not a crash", () => {
  assert.equal(deviceLabel(null), "Unknown device");
  assert.equal(deviceLabel(undefined), "Unknown device");
  assert.equal(deviceLabel(""), "Unknown device");
});

test("something unrecognisable still gets a usable label", () => {
  const label = deviceLabel("SomeBot/1.0");
  assert.ok(label.length > 0);
  assert.notEqual(label, "");
});

test("the cookie name is stable", () => {
  // Changing it silently signs every device out of its approval and puts the
  // whole team back in the owner's queue.
  assert.equal(DEVICE_COOKIE, "pp_device");
});
