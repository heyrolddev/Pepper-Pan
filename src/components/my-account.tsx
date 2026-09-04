"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMyPhone } from "@/app/admin/me/actions";
import { acceptRoleOffer, declineRoleOffer } from "@/app/account/actions";
import { Field, inputClass } from "@/components/admin-dialog";
import { ROLE_BLURBS, ROLE_LABELS, type Role } from "@/lib/permissions";

/**
 * The one screen in HQ that is about the person rather than the shop.
 *
 * It exists because of a hole in the last change: a role is offered and
 * accepted on the customer account page, and staff cannot reach that page.
 * The header hides the account chip from anybody who works here — deliberately,
 * since they signed in to run the shop rather than to browse it — so the
 * accept button was sitting somewhere the only people who needed it could not
 * go. An offer nobody can accept is not an offer.
 */
export function MyAccount({
  name,
  email,
  role,
  phone,
  pendingRole,
}: {
  name: string | null;
  email: string;
  role: Role;
  phone: string | null;
  pendingRole: Role | null;
}) {
  const router = useRouter();

  const [number, setNumber] = useState(phone ?? "");
  const [saved, setSaved] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [savingPhone, savePhone] = useTransition();

  const [offerError, setOfferError] = useState<string | null>(null);
  const [deciding, decide] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      {/* The offer first. It is the only thing here with somebody else
          waiting on the other end of it. */}
      {pendingRole && (
        <section className="rounded-3xl bg-ink-950 p-6 text-cream-50 ring-2 ring-gold-400 sm:p-8">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gold-400">
            <span className="h-px w-6 bg-gold-400/60" />
            Waiting for you
          </p>
          <h2 className="mt-4 font-display text-2xl font-black tracking-tight sm:text-3xl">
            You&apos;ve been offered the {ROLE_LABELS[pendingRole].toLowerCase()} role
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream-100/80">
            {ROLE_BLURBS[pendingRole]}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream-100/60">
            Nothing changes until you accept.
          </p>

          {offerError && (
            <p className="mt-4 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold">
              {offerError}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              disabled={deciding}
              onClick={() =>
                decide(async () => {
                  const r = await acceptRoleOffer();
                  if (r.error) setOfferError(r.error);
                  else router.refresh();
                })
              }
              className="rounded-full bg-gold-400 px-5 py-2.5 text-sm font-black text-ink-950 transition-colors hover:bg-gold-300 disabled:opacity-60"
            >
              {deciding ? "…" : "Accept the role"}
            </button>
            <button
              disabled={deciding}
              onClick={() =>
                decide(async () => {
                  const r = await declineRoleOffer();
                  if (r.error) setOfferError(r.error);
                  else router.refresh();
                })
              }
              className="rounded-full px-5 py-2.5 text-sm font-bold text-cream-100/70 transition-colors hover:text-cream-50 disabled:opacity-60"
            >
              No thanks
            </button>
          </div>
        </section>
      )}

      <section className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10 sm:p-8">
        <h3 className="font-display text-xl font-black tracking-tight text-ink-950">
          {name ?? "Your account"}
        </h3>
        <p className="mt-1 text-sm text-ink-800/60">
          {ROLE_LABELS[role]} · {email}
        </p>

        <div className="mt-6 max-w-sm">
          <Field
            label="Your mobile number"
            hint="Change it yourself — this is how the shop reaches you when a shift falls through."
          >
            <input
              value={number}
              onChange={(e) => {
                setNumber(e.target.value);
                setSaved(false);
                setPhoneError(null);
              }}
              type="tel"
              inputMode="tel"
              placeholder="09xx xxx xxxx"
              className={inputClass}
            />
          </Field>

          {phoneError && (
            <p className="mt-3 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
              {phoneError}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              disabled={savingPhone || number.trim() === (phone ?? "")}
              onClick={() =>
                savePhone(async () => {
                  const r = await saveMyPhone(number);
                  if (r.error) setPhoneError(r.error);
                  else {
                    setSaved(true);
                    router.refresh();
                  }
                })
              }
              className="rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {savingPhone ? "Saving…" : "Save number"}
            </button>
            {saved && (
              <span className="text-sm font-semibold text-jade-700">Saved</span>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border-2 border-dashed border-ink-950/15 p-6 sm:p-8">
        <h3 className="font-display text-lg font-black tracking-tight text-ink-950">
          Your sign-in email
        </h3>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          <strong className="text-ink-950">{email}</strong> — and it can only
          be changed by the owner, on purpose.
        </p>
        <p className="mt-3 max-w-xl text-sm text-ink-800/60">
          This address is how you sign in and where a password reset is sent.
          An account that can move its own email is an account somebody can
          take over: change the address, then ask to reset the password. Ask
          the owner and they can change it for you in a few seconds.
        </p>
      </section>
    </div>
  );
}
