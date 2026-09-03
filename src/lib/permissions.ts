/**
 * Who may do what.
 *
 * Until now this system had two kinds of person — "staff" and "owner" — and
 * `isStaff()` was the gate on almost everything. That gate is far wider than
 * it reads: a member of staff could change any price, see every ingredient's
 * purchase cost, edit the cash ledger and read the month's takings. For a
 * stall where the counter is worked by whoever is free that day, that is the
 * whole business handed over with the till.
 *
 * The fix is not more `role === "owner"` checks sprinkled through twenty
 * files. It is one table, here, that answers a question in the shop's own
 * terms — "can this person restock?" — so that adding a role later is an edit
 * to a list rather than an audit of the codebase. Every call site names a
 * capability, never a role, and the two places a permission actually has to
 * hold (the server action, and the RLS policy behind it) both derive from it.
 *
 * Read this file as the answer to "what can my staff see?", because it is.
 */

export const ROLES = ["owner", "manager", "staff", "customer"] as const;
export type Role = (typeof ROLES)[number];

/**
 * What the shop calls each role, and what it means. Shown on the badge in HQ
 * and in the staff editor, so nobody has to guess what they're granting.
 */
export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
  customer: "Customer",
};

export const ROLE_BLURBS: Record<Role, string> = {
  owner: "Everything. Prices, money, the books, and who works here.",
  manager:
    "Runs a service without seeing the books. Can restock, cook batches, log waste, mark a dish sold out and post promos — but not change a price or see what anything earns.",
  staff:
    "The counter and the orders. Sees what stock is left and can log waste. No prices, no costs, no takings.",
  customer: "Not shop staff — an ordinary customer account.",
};

/**
 * The verbs.
 *
 * Deliberately in the shop's language rather than the schema's: the question
 * an owner asks is "can they restock", not "can they insert into
 * ingredient_lots". Where one verb covers several tables that is a decision,
 * not an oversight — they rise and fall together.
 */
export const CAPABILITIES = [
  /** See the order board and move an order along it. */
  "orders",
  /** Ring up a walk-in on the till. */
  "till",
  /** Reply to a customer in the inbox, and edit the canned answers. */
  "chat",
  /** See what is left on the shelf — counts only, no money attached. */
  "stock.view",
  /** Write off something that was thrown away. */
  "waste",
  /**
   * Restock, cycle-count, cook a batch, edit a recipe.
   *
   * Carries ingredient purchase prices with it, necessarily: you cannot
   * record a delivery without saying what it cost, and the forms pre-fill
   * from those numbers. This is not the same as seeing the margin — that is
   * `costs`, and it stays the owner's.
   */
  "stock.manage",
  /** Mark a dish sold out or back on, without touching what it is or costs. */
  "menu.availability",
  /**
   * Write the promos and news the customers see on the homepage.
   *
   * A step above a shift's business — it is the shop talking in public — but
   * it is also the kind of thing decided on the day, by whoever is running
   * the service. Keeping it with the owner alone means the promo goes up on
   * Thursday when it was decided on Tuesday.
   */
  "announcements",
  /**
   * Write the answers — the ones Ask Pepper Pan gives, and the ones printed
   * on the homepage, which since migration 0026 are the same answers.
   *
   * Split out of `chat` rather than sharing it. Replying to one customer in
   * the inbox is a shift's work and stays with staff; writing the answer the
   * shop gives everybody, forever, in public, is not.
   */
  "faq",
  /** Add a dish, change its name, price, photo or description. */
  "menu.edit",
  /** What each DISH costs and earns — the margin. The owner's alone. */
  "costs",
  /** Analytics, the month's takings, break-even, cash and utang. */
  "business",
  /** Who works here, their shifts, and what a shift took. */
  "staff.manage",
  /** Hours, delivery, payment settings, alerts, backup, starting fresh. */
  "settings",
  /**
   * Ask HQ — the assistant that explains the system and shows the working
   * behind any figure.
   *
   * Owner only, and not because the explanations are secret. To show how net
   * profit was arrived at it has to read net profit, and to explain a dish's
   * margin it has to read what the dish costs. Handing that to a manager
   * would hand them the books through the back door, which is exactly what
   * the manager role exists to avoid.
   */
  "assistant",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Staff, then manager on top of it, then owner on top of that.
 *
 * Written as a chain rather than three independent lists so a role can never
 * end up with a permission the role above it lacks — which is the bug that
 * makes a permissions table worse than no table at all.
 */
const STAFF: Capability[] = ["orders", "till", "chat", "stock.view", "waste"];

const MANAGER: Capability[] = [
  ...STAFF,
  "stock.manage",
  "menu.availability",
  "announcements",
  "faq",
];

// Everything. Listed by spreading the constant rather than by name, so a new
// capability is the owner's the moment it is added — the failure that matters
// is a capability nobody has, not one the owner has.
const OWNER: Capability[] = [...CAPABILITIES];

const BY_ROLE: Record<Role, Capability[]> = {
  owner: OWNER,
  manager: MANAGER,
  staff: STAFF,
  customer: [],
};

/** Everyone who works here, in order of standing. */
export const SHOP_ROLES: Role[] = ["owner", "manager", "staff"];

export function isShopRole(role: string | null | undefined): role is Role {
  return role === "owner" || role === "manager" || role === "staff";
}

/**
 * The one question worth asking.
 *
 * Takes a role rather than a viewer so it is usable in the browser, where the
 * sidebar has a role string and no session. The server wrapper is `can()` in
 * `auth.ts`, and that is the one that actually guards anything.
 */
export function roleCan(role: string | null | undefined, what: Capability): boolean {
  if (!isShopRole(role)) return false;
  return BY_ROLE[role].includes(what);
}

/**
 * The badge, in one place.
 *
 * A role that isn't one of the shop's — or a missing profile — falls back to
 * "Staff" rather than to "Owner". Getting this wrong in the safe direction
 * means somebody is under-titled for a moment; getting it wrong the other way
 * tells a new hire they run the business.
 */
export function roleLabel(role: string | null | undefined): string {
  return isShopRole(role) ? ROLE_LABELS[role] : "Staff";
}
