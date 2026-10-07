/**
 * Where a thing happened.
 *
 * ── Branch is a place, not a permission ──────────────────────────────────
 *
 * The two axes are deliberately separate, and keeping them separate is what
 * stops this feature sprawling:
 *
 *   role    WHAT you may do      (`permissions.ts` — owner / manager / staff)
 *   branch  WHERE you may do it  (here)
 *
 * So "the Express account sees sales and stock but never margin" needs no new
 * concept: it is the existing `staff` role, which has never carried `costs`
 * or `business`, pinned to the Express branch. This file answers only WHICH
 * ROWS. It never answers which verbs — ask `can()` for that.
 *
 * Add a branch-specific permission here and the two axes start to blur; the
 * next person then has to read both files to answer either question.
 *
 * ── Null means everywhere ────────────────────────────────────────────────
 *
 * A profile with no branch roams: the owner, and anyone the owner deliberately
 * leaves unpinned. It is not "unknown" — it is "all of them", and that is the
 * safe default for the one account that existed before branches did.
 */

export const MAIN_BRANCH_ID = "main";

export type Branch = {
  id: string;
  name: string;
  /** The commissary. Exactly one, enforced in the database. */
  isMain: boolean;
  /** "Friday, Saturday and Sunday nights" — free text, not a schedule. */
  tradingNote: string | null;
  active: boolean;
};

/** Just enough of a viewer to answer the where question. */
export type BranchViewer = { branchId?: string | null } | null | undefined;

/** Is this person tied to one place? */
export function isPinned(viewer: BranchViewer): boolean {
  return Boolean(viewer?.branchId);
}

/**
 * The branch whose rows this person may touch, or null for all of them.
 *
 * Returned rather than defaulted to main on purpose: null and "main" are
 * different answers, and collapsing them would quietly pin the owner to
 * Apalit and hide every other branch from the one person who needs to see
 * them all.
 */
export function pinnedBranchId(viewer: BranchViewer): string | null {
  return viewer?.branchId ?? null;
}

/** May this person see rows belonging to that branch? */
export function canSeeBranch(viewer: BranchViewer, branchId: string): boolean {
  const pin = pinnedBranchId(viewer);
  return pin === null || pin === branchId;
}

/** The branches to offer this person, in the order they should read. */
export function visibleBranches(all: Branch[], viewer: BranchViewer): Branch[] {
  const mine = all.filter((b) => canSeeBranch(viewer, b.id));
  // The commissary first, then the rest by name: a list whose order moves as
  // branches open is a list nobody learns the shape of.
  return [...mine].sort((a, b) =>
    a.isMain === b.isMain ? a.name.localeCompare(b.name) : a.isMain ? -1 : 1
  );
}

/** Where this person lands when they sign in. */
export function landingBranch(all: Branch[], viewer: BranchViewer): Branch | null {
  const mine = visibleBranches(all, viewer);
  return mine.find((b) => b.id === pinnedBranchId(viewer)) ?? mine[0] ?? null;
}

/**
 * What a figure on screen is actually counting.
 *
 * Every total that can span more than one branch has to say so. This is the
 * whole mitigation for the one failure this feature can produce: a number
 * that looks like one branch's and is quietly two. A figure labelled
 * "All branches" is honest; the same figure labelled nothing is a trap, and
 * it is the trap that has already cost this project twice.
 */
export function scopeLabel(all: Branch[], viewer: BranchViewer, branchId?: string | null): string {
  if (branchId) {
    return all.find((b) => b.id === branchId)?.name ?? branchId;
  }
  const mine = visibleBranches(all, viewer);
  if (mine.length === 1) return mine[0].name;
  return "All branches";
}

/**
 * Does a figure covering `branchId` need saying out loud?
 *
 * False for somebody who only has one branch anyway — telling the person at
 * the booth that they are looking at the booth is noise, and noise is how a
 * label stops being read.
 */
export function needsScopeLabel(all: Branch[], viewer: BranchViewer): boolean {
  return visibleBranches(all, viewer).length > 1;
}

/**
 * Which branch this till is ringing up for.
 *
 * ── Why this is not simply the viewer's pin ──────────────────────────────
 *
 * Most of the time it is. The person at the booth is pinned to the booth and
 * there is nothing to decide. But the owner is pinned to nothing, and the
 * owner works a Friday night at El Mercado — so "the sale belongs to whoever
 * rang it up's branch" would file that night's takings at Apalit, which is
 * the exact failure this whole feature exists to prevent, arriving through
 * the back door.
 *
 * So an unpinned person chooses, and the choice sticks to the DEVICE rather
 * than to the sale. A dropdown on every ticket is a dropdown that is wrong by
 * lunchtime; the tablet at the booth is at the booth all night.
 *
 * A pinned person cannot choose at all, and a request to the contrary is
 * refused rather than ignored — a till that quietly files a sale somewhere
 * other than where it was asked to is worse than one that says no.
 */
export type TillBranch =
  | { branchId: string; error: null }
  | { branchId: null; error: string };

export function resolveTillBranch(
  viewer: BranchViewer,
  requested: string | null | undefined,
  all: Branch[]
): TillBranch {
  const pin = pinnedBranchId(viewer);

  if (pin !== null) {
    if (requested && requested !== pin) {
      return {
        branchId: null,
        error: "You can only ring up sales for your own branch.",
      };
    }
    return { branchId: pin, error: null };
  }

  // Unpinned: the device's choice, falling back to the commissary. Falling
  // back rather than refusing, because the shop at Apalit has rung up sales
  // with no branch in mind since long before branches existed.
  const wanted = requested || MAIN_BRANCH_ID;
  const branch = all.find((b) => b.id === wanted);
  if (!branch) {
    return { branchId: null, error: "That branch does not exist." };
  }
  if (!branch.active) {
    return { branchId: null, error: `${branch.name} is closed.` };
  }
  return { branchId: branch.id, error: null };
}
