"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/lib/dialog";

/**
 * Signing out, with a question first.
 *
 * It used to go on the first click, and it sits in a row of ordinary links —
 * one slip on a phone and a customer loses the order they were tracking, or
 * the owner drops out of HQ mid-service and has to find their password with
 * their hands covered in oil. Neither is destructive, but both are a real
 * interruption at exactly the wrong moment, and the cost of asking is one tap.
 *
 * The dialog is deliberately the same on both surfaces. The button that opens
 * it looks different in a dark nav, a cream account page and the HQ rail, but
 * once you're being asked a question, the question should look like itself.
 *
 * ── Three faults it kept while everything copied from it was fixed ───────
 *
 * This was the first dialog in the app, and `AdminDialog` was modelled on it.
 * The copy then learned to portal out, lock the page and trap focus; the
 * original learned none of it, and it is the one the owner meets most often
 * because it guards the way out of HQ.
 *
 * The worst of the three was invisible until two things were open at once.
 * The trigger lives in HQ's sidebar, the sidebar is `position: sticky`, and
 * sticky makes a stacking context unconditionally — so this dialog's `z-60`
 * was ranked INSIDE the sidebar, and any ordinary panel on the page, all of
 * which are `z-50`, drew straight over it. Measured with one open: the point
 * where "Yes, sign out" is painted belonged to the other panel. Not merely
 * hidden — unclickable.
 *
 * All three now come from `useDialog`, which is also what `AdminDialog` uses,
 * so there is one of them rather than two that drift.
 */
export function SignOutButton({
  solid = true,
  variant = "nav",
}: {
  solid?: boolean;
  /** How the trigger is styled. The dialog never changes. */
  variant?: "nav" | "rail" | "block" | "menu";
}) {
  const [asking, setAsking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  /**
   * The Supabase client is fetched here rather than imported at the top, and
   * that one line is worth 64 KB gzipped on every page of the site.
   *
   * This button lives in the nav, the nav lives in the root layout, so a
   * top-level import put the whole `@supabase/supabase-js` browser client into
   * the bundle of every page — the homepage, the menu, the reviews — for
   * visitors who are not signed in and will never press it. It is needed for
   * exactly one click, so it is fetched on exactly that click. The extra
   * round trip lands inside the time the confirm dialog is already open.
   */
  /**
   * Signing out, and finishing the job whatever Supabase says.
   *
   * ── The bug this replaces ────────────────────────────────────────────
   *
   * It used to be four lines with no catch and no way back: set the button
   * to "Signing out…", await `signOut()`, refresh. If that await REJECTED —
   * and it rejects routinely, with `AuthSessionMissingError` when the
   * session has already lapsed, or any network error on a stall's
   * connection — the component was left with `signingOut` stuck true, the
   * dialog still open, both buttons disabled and nothing on screen saying
   * why. The customer presses "Yes, sign out" again and again and the page
   * does nothing at all. That is exactly what was reported.
   *
   * Three things fix it, and all three are needed:
   *
   * `scope: "local"` — the default asks the server to revoke the refresh
   * token everywhere, which is the part that fails when the session is
   * already gone or the network is bad. Clearing this browser is what the
   * person actually asked for, and it cannot fail for either reason.
   *
   * The catch — a sign-out that errors must still sign you out. There is no
   * state in which the right answer is to leave somebody signed in because
   * a token could not be revoked; the local session is gone either way.
   *
   * A full navigation rather than `router.refresh()` — the cookies are
   * cleared by the client, and only a real request makes the server read
   * them again. A refresh re-renders from a router cache that still
   * believes in the old session, which is how a signed-out person keeps
   * seeing their own name in the header.
   *
   * `replace` rather than `assign`, and an absolute URL rather than "/":
   * replace keeps the signed-in page out of the back button, where the
   * browser would otherwise restore it whole from its own cache — a
   * signed-out account page one tap away is the worst version of this bug,
   * not a smaller one.
   */
  async function confirm() {
    setSigningOut(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // Nothing to report and nothing to decide: the session is being
      // thrown away on this device regardless, and the navigation below is
      // what makes that true on screen.
    }
    setAsking(false);
    window.location.replace(window.location.origin);
  }

  const triggerClass =
    variant === "menu"
      ? // A row in the account dropdown, so it has to match the links above
        // it exactly — same height, same padding, same left edge. It is the
        // one destructive item in that menu, which is why it goes red on
        // hover while they go grey.
        "flex w-full items-center rounded-xl px-2 py-2.5 text-left text-sm font-bold text-ink-800 transition-colors hover:bg-brand-600 hover:text-cream-50"
      : variant === "rail"
      ? "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-cream-100/70 transition-colors hover:bg-brand-600/20 hover:text-cream-50"
      : variant === "block"
        ? "rounded-full bg-ink-950/5 px-5 py-2.5 text-sm font-bold text-ink-800 ring-1 ring-ink-950/10 transition-colors hover:bg-brand-600 hover:text-cream-50"
        : `rounded-full px-3 py-2 transition-colors ${
            solid
              ? "text-ink-800 hover:text-brand-600"
              : "text-cream-100/80 hover:text-gold-400"
          }`;

  return (
    <>
      <button onClick={() => setAsking(true)} className={triggerClass}>
        {variant === "rail" && (
          <span aria-hidden className="w-4 shrink-0 text-center text-xs opacity-40">
            ⏻
          </span>
        )}
        Sign out
      </button>

      {asking && (
        <Ask
          signingOut={signingOut}
          onStay={() => setAsking(false)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

function Ask({
  signingOut,
  onStay,
  onConfirm,
}: {
  signingOut: boolean;
  onStay: () => void;
  onConfirm: () => void;
}) {
  const { mounted, panel } = useDialog<HTMLDivElement>({
    onClose: onStay,
    closable: !signingOut,
  });
  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="signout-title"
      className="fixed inset-0 z-[70] grid place-items-center p-4"
    >
      <button
        aria-label="Cancel"
        onClick={() => !signingOut && onStay()}
        className="absolute inset-0 bg-ink-950/70"
      />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-3xl bg-cream-50 p-6 shadow-2xl outline-none ring-1 ring-ink-950/10"
      >
        <p
          id="signout-title"
          className="font-display text-2xl font-black text-ink-950"
        >
          Sign out?
        </p>
        <p className="mt-2 text-sm text-ink-800/70">
          You&apos;ll need your email and password to get back in.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* No `autoFocus` on the red one any more. By its own reasoning this
              dialog is opened by accident more often than on purpose, and
              parking the cursor on the destructive answer means the stray
              Enter that follows the stray click completes the accident. The
              panel takes focus instead, so Enter does nothing until somebody
              chooses. */}
          <button
            onClick={onStay}
            disabled={signingOut}
            className="rounded-full px-5 py-3 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950 disabled:opacity-50"
          >
            Stay signed in
          </button>
          <button
            onClick={onConfirm}
            disabled={signingOut}
            className="rounded-full bg-brand-600 px-6 py-3 text-sm font-black text-cream-50 transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
          >
            {signingOut ? "Signing out…" : "Yes, sign out"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
