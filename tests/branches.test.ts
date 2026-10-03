import test from "node:test";
import assert from "node:assert/strict";

import {
  MAIN_BRANCH_ID,
  canSeeBranch,
  isPinned,
  landingBranch,
  needsScopeLabel,
  pinnedBranchId,
  scopeLabel,
  visibleBranches,
  type Branch,
} from "../src/lib/branches.ts";

/**
 * Where a person may look.
 *
 * The failure this guards against is not a crash — it is a number on a screen
 * that looks like one branch's takings and is quietly two. Every assertion
 * here is about that.
 */

const main: Branch = {
  id: "main",
  name: "Pepper Pan Apalit",
  isMain: true,
  tradingNote: "Open daily",
  active: true,
};
const express: Branch = {
  id: "express-el-mercado",
  name: "Pepper Pan Express — El Mercado",
  isMain: false,
  tradingNote: "Friday, Saturday and Sunday nights",
  active: true,
};
const all = [express, main]; // deliberately out of order

const owner = { branchId: null };
const booth = { branchId: "express-el-mercado" };

test("null is everywhere, not unknown", () => {
  // Collapsing null to "main" would pin the owner to Apalit and hide every
  // other branch from the one person who has to see them all.
  assert.equal(pinnedBranchId(owner), null);
  assert.equal(isPinned(owner), false);
  assert.equal(canSeeBranch(owner, "main"), true);
  assert.equal(canSeeBranch(owner, "express-el-mercado"), true);
  assert.equal(canSeeBranch(owner, "a-branch-that-does-not-exist-yet"), true);
});

test("pinned means one branch and no other", () => {
  assert.equal(isPinned(booth), true);
  assert.equal(canSeeBranch(booth, "express-el-mercado"), true);
  assert.equal(canSeeBranch(booth, "main"), false);
});

test("a signed-out viewer is treated as unpinned, never as staff", () => {
  // This file answers WHERE, never WHETHER. `can()` is what refuses a
  // stranger, and these helpers must not accidentally look like a second
  // gate that someone later trusts instead.
  assert.equal(pinnedBranchId(null), null);
  assert.equal(pinnedBranchId(undefined), null);
});

test("the commissary reads first, whatever order the rows arrive in", () => {
  assert.deepEqual(
    visibleBranches(all, owner).map((b) => b.id),
    ["main", "express-el-mercado"]
  );
  assert.equal(MAIN_BRANCH_ID, "main");
});

test("the booth is offered only its own branch", () => {
  assert.deepEqual(
    visibleBranches(all, booth).map((b) => b.id),
    ["express-el-mercado"]
  );
});

test("you land where you work", () => {
  assert.equal(landingBranch(all, booth)?.id, "express-el-mercado");
  // The owner lands on the commissary, which is where the business is run
  // from, not on whichever branch happens to sort first.
  assert.equal(landingBranch(all, owner)?.id, "main");
  assert.equal(landingBranch([], owner), null);
});

test("a figure says which branch it counts", () => {
  assert.equal(scopeLabel(all, owner, "express-el-mercado"), "Pepper Pan Express — El Mercado");
  assert.equal(scopeLabel(all, owner, null), "All branches");
  // The person at the booth has one branch, so an unscoped figure is still
  // only ever theirs — and it says so by name rather than "All branches",
  // which would be true and completely misleading.
  assert.equal(scopeLabel(all, booth, null), "Pepper Pan Express — El Mercado");
});

test("an unknown branch id is shown, not swallowed", () => {
  // A blank where a branch name should be reads as a bug in the page. The id
  // at least tells somebody what to go and look for.
  assert.equal(scopeLabel(all, owner, "gone-branch"), "gone-branch");
});

test("the label is only shown to someone who has more than one branch", () => {
  assert.equal(needsScopeLabel(all, owner), true);
  assert.equal(needsScopeLabel(all, booth), false);
  // One branch in the whole business — the shop as it is today. Nothing to
  // label, and labelling it anyway trains people to stop reading the label.
  assert.equal(needsScopeLabel([main], owner), false);
});
