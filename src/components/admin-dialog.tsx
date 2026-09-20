"use client";

import { createPortal } from "react-dom";
import { useDialog } from "@/lib/dialog";

/**
 * The one dialog shape HQ uses.
 *
 * Modelled on the sign-out confirmation rather than invented fresh, so the
 * store-room forms feel like the rest of the workspace: same scrim, same
 * corner radius, same way out. Escape closes it and so does the scrim,
 * because a dialog you can only leave by finding the right button is a trap —
 * and these open on a phone, one-handed, mid-service.
 *
 * It renders into `document.body` rather than where it is written, and that
 * is load-bearing rather than tidy. `fixed inset-0 z-[60]` sounds like it
 * should sit above everything, and it does not: z-index only ranks an element
 * against its siblings inside the nearest stacking context, and
 * `position: sticky` creates one of those unconditionally. The clock lives in
 * HQ's sticky sidebar, so its "Clock out" dialog was ranked inside that
 * sidebar — 60 or 6000, it could not climb over the page beside it, and the
 * counter's menu drew straight over the top of it.
 *
 * A portal moves the markup out of that context entirely, so the dialog is
 * ranked against the page itself. Every dialog in HQ goes through here, so
 * this fixes the ones nobody has noticed yet as well as the one that was
 * reported.
 *
 * The portal, the scroll lock, Escape and the focus trap all live in
 * `useDialog` now — not for tidiness, but because they were copied from the
 * sign-out confirmation and then improved only here, leaving the original
 * with every fault. See that hook for what each one costs when it is missing.
 */

export function AdminDialog({
  title,
  subtitle,
  onClose,
  busy = false,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** While true, the dialog refuses to close — a half-written row is worse. */
  busy?: boolean;
  /**
   * A form, rather than a question.
   *
   * `max-w-lg` leaves 464px of content once the padding is off, which is
   * right for "are you sure?" and too narrow for a row of fields — at that
   * width a searchable picker sharing a line with two text boxes came out
   * 36px wide. Opt-in, so every existing dialog keeps the size it was built
   * at; still a bottom sheet on a phone either way.
   */
  wide?: boolean;
  children: React.ReactNode;
}) {
  // The portal target only exists in the browser, so the first render has to
  // produce nothing — matching the server — and only then reach for
  // document.body.
  //
  // Through useSyncExternalStore rather than a setState in an effect: the
  // React Compiler rejects the latter outright, and it is right to. This says
  // the same thing without a second render pass — "false on the server, true
  // in a browser" is exactly the question the hook exists to answer.
  const { mounted, panel } = useDialog<HTMLDivElement>({
    onClose,
    closable: !busy,
  });

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] grid place-items-end p-0 sm:place-items-center sm:p-4"
    >
      <button
        aria-label="Close"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 bg-ink-950/70"
      />
      {/* Bottom sheet on a phone, centred card on a laptop. The store room
          gets updated standing at the shelf more often than sitting down. */}
      <div
        ref={panel}
        tabIndex={-1}
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-cream-50 p-6 shadow-2xl outline-none ring-1 ring-ink-950/10 sm:rounded-3xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-black text-ink-950">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-ink-800/60">{subtitle}</p>
            )}
          </div>
          <button
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-950/5 text-ink-800 transition-colors hover:bg-ink-950/10"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** A labelled field, so every form in HQ lines up the same way. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/60">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-ink-800/50">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border-2 border-ink-950/10 bg-cream-100 px-4 py-2.5 text-ink-950 outline-none transition-colors placeholder:text-ink-800/35 focus:border-gold-400";
