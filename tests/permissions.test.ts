import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITIES,
  SHOP_ROLES,
  isShopRole,
  roleCan,
  roleLabel,
  type Capability,
} from "../src/lib/permissions.ts";

/** What a role may do, asked one capability at a time through the real gate. */
const allowed = (role: string | null) => CAPABILITIES.filter((c) => roleCan(role, c));

/**
 * The security boundary, tested from the outside.
 *
 * `roleCan` decides what a person is shown; `can` in auth.ts is what actually
 * guards a server action. The two share this table, so a hole here is a hole
 * everywhere — which is why these are the first tests in the project.
 */

test("a customer can do nothing in the back office", () => {
  for (const capability of CAPABILITIES) {
    assert.equal(roleCan("customer", capability), false, `customer got ${capability}`);
  }
  assert.deepEqual(allowed("customer"), []);
});

test("no role at all is treated as no access, not as staff", () => {
  // The cases that arrive from a missing profile row or a tampered client.
  for (const missing of [null, undefined, "", "OWNER", "admin", "owner "]) {
    assert.equal(roleCan(missing, "business"), false, `${JSON.stringify(missing)} got business`);
    assert.equal(isShopRole(missing), false);
  }
});

test("the ladder never inverts: staff ⊆ manager ⊆ owner", () => {
  const staff = allowed("staff");
  const manager = allowed("manager");
  const owner = allowed("owner");

  for (const c of staff) assert.ok(manager.includes(c), `manager is missing staff's ${c}`);
  for (const c of manager) assert.ok(owner.includes(c), `owner is missing manager's ${c}`);
});

test("the owner has every capability that exists", () => {
  // Guards the failure that matters: a new capability nobody can reach.
  assert.deepEqual([...allowed("owner")].sort(), [...CAPABILITIES].sort());
});

test("the money and staff screens are the owner's alone", () => {
  const ownerOnly: Capability[] = [
    "menu.edit",
    "costs",
    "business",
    "staff.manage",
    "settings",
  ];
  for (const c of ownerOnly) {
    assert.equal(roleCan("owner", c), true, `owner lost ${c}`);
    assert.equal(roleCan("manager", c), false, `manager gained ${c}`);
    assert.equal(roleCan("staff", c), false, `staff gained ${c}`);
  }
});

test("an unknown role is badged Staff, never Owner", () => {
  assert.equal(roleLabel(null), "Staff");
  assert.equal(roleLabel("nonsense"), "Staff");
  assert.equal(roleLabel("owner"), "Owner");
});

test("every shop role is a real role", () => {
  for (const r of SHOP_ROLES) assert.ok(isShopRole(r));
});
