"use client";

import { useMemo, useState, useTransition } from "react";
import { peso } from "@/lib/costing";
import { formatDateTime } from "@/lib/format-date";
import { ROLE_BLURBS, ROLE_LABELS } from "@/lib/permissions";
import { deleteStaffAccount, setStaffRole } from "@/app/admin/staff/actions";
import { setStaffEmail } from "@/app/admin/me/actions";
import { HistoryList } from "@/components/history-list";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { hqTitle } from "@/lib/hq-theme";

export type Person = {
  id: string;
  name: string | null;
  phone: string | null;
  role: "owner" | "manager" | "staff" | "customer";
  joined: string;
  onShift: boolean;
  shiftsWorked: number;
};

export type ShiftReport = {
  id: string;
  staffId: string;
  staffName: string;
  startedAt: string;
  endedAt: string | null;
  length: string;
  closingCash: number | null;
  note: string | null;
  sales: number;
  takings: number;
  /** Cash sales only — GCash was never in the drawer. */
  cashExpected: number;
  actions: { at: string; category: string; description: string }[];
};

/**
 * Who works here, and what each shift did.
 *
 * The owner asked to see what time staff logged in. Supabase stores that for
 * free, but it answers the wrong question — someone can sign in from home, or
 * stay signed in for a week. A shift is clocked deliberately, and everything
 * done inside it is stamped with it, which turns "was online at 4pm" into a
 * number you could actually pay someone from.
 *
 * The drawer line is the point of the report. Cash taken during the shift,
 * against what was counted at the end: over, short, or square.
 */

function Money({ n, tone }: { n: number; tone?: "good" | "bad" }) {
  return (
    <span
      className={`font-display font-black tabular-nums ${
        tone === "bad" ? "text-brand-600" : tone === "good" ? "text-jade-700" : "text-ink-950"
      }`}
    >
      {peso(n)}
    </span>
  );
}

/**
 * One shift, foldable.
 *
 * A <div>, not an <li>: HistoryList owns the list and provides the item, and
 * an <li> inside an <li> is invalid markup that browsers repair differently.
 * Where the list semantics live is the list's business, not the card's.
 */
function ShiftCard({ r }: { r: ShiftReport }) {
  const [open, setOpen] = useState(false);
  const running = r.endedAt === null;
  // Only meaningful once someone has actually counted. Blank is not zero.
  const diff = r.closingCash === null ? null : r.closingCash - r.cashExpected;
  const square = diff !== null && Math.abs(diff) < 0.005;

  return (
    <div className="overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-ink-950/10">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-5 py-4 text-left transition-colors hover:bg-cream-200/60"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="font-display text-lg font-black leading-tight text-ink-950">
              {r.staffName}
              {running && (
                <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-jade-600 px-2.5 py-0.5 align-middle text-[10px] font-black uppercase tracking-wide text-cream-50">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cream-50" />
                  On shift
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-ink-800/55">
              {formatDateTime(r.startedAt)}
              {r.endedAt ? ` — ${formatDateTime(r.endedAt)}` : " — still going"}
              <span className="ml-2 font-bold text-ink-800/70">{r.length}</span>
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm text-ink-800/60">
              {r.sales} sale{r.sales === 1 ? "" : "s"} ·{" "}
              <Money n={r.takings} />
            </p>
            {diff !== null && (
              <p className="mt-0.5 text-xs font-bold">
                {square ? (
                  <span className="text-jade-700">Drawer square</span>
                ) : diff < 0 ? (
                  <span className="text-brand-600">
                    {peso(Math.abs(diff))} short
                  </span>
                ) : (
                  <span className="text-chili-700">{peso(diff)} over</span>
                )}
              </p>
            )}
            {diff === null && !running && (
              <p className="mt-0.5 text-xs text-ink-800/40">Drawer not counted</p>
            )}
          </div>
        </div>

        <p className="mt-2 text-xs text-ink-800/45">
          {r.actions.length} thing{r.actions.length === 1 ? "" : "s"} recorded
          <span className="ml-2 opacity-70">{open ? "Hide" : "See the detail"}</span>
        </p>
      </button>

      {open && (
        <div className="border-t border-ink-950/10 bg-cream-50/70 px-5 py-4">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div className="flex justify-between border-b border-ink-950/5 pb-1.5">
              <dt className="text-sm text-ink-800/60">Taken in total</dt>
              <dd><Money n={r.takings} /></dd>
            </div>
            <div className="flex justify-between border-b border-ink-950/5 pb-1.5">
              <dt className="text-sm text-ink-800/60">Of that, cash</dt>
              <dd><Money n={r.cashExpected} /></dd>
            </div>
            <div className="flex justify-between border-b border-ink-950/5 pb-1.5">
              <dt className="text-sm text-ink-800/60">Counted in the drawer</dt>
              <dd>
                {r.closingCash === null ? (
                  <span className="text-sm text-ink-800/40">not counted</span>
                ) : (
                  <Money n={r.closingCash} />
                )}
              </dd>
            </div>
            <div className="flex justify-between border-b border-ink-950/5 pb-1.5">
              <dt className="text-sm text-ink-800/60">Difference</dt>
              {/* Said in words rather than as a signed number: "₱-520.00" is
                  a sign nobody reads carefully at the end of a shift, and
                  short and over need to be told apart at a glance. */}
              <dd>
                {diff === null ? (
                  <span className="text-sm text-ink-800/40">nothing to compare</span>
                ) : square ? (
                  <span className="font-display font-black text-jade-700">Square</span>
                ) : (
                  <span
                    className={`font-display font-black tabular-nums ${
                      diff < 0 ? "text-brand-600" : "text-chili-700"
                    }`}
                  >
                    {peso(Math.abs(diff))} {diff < 0 ? "short" : "over"}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {r.note && (
            <p className="mt-3 rounded-xl bg-gold-400/20 px-4 py-2.5 text-sm text-ink-950">
              &ldquo;{r.note}&rdquo;
            </p>
          )}

          {r.actions.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1">
              {r.actions.map((a, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-ink-800/40">
                    {formatDateTime(a.at)}
                  </span>
                  <span className="text-ink-800/80">{a.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RoleButton({
  person,
  to,
  label,
  tone,
}: {
  person: Person;
  to: "owner" | "manager" | "staff" | "customer";
  label: string;
  tone: "dark" | "red" | "gold";
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  return (
    <>
      <button
        disabled={busy}
        onClick={() =>
          startTransition(async () => {
            const r = await setStaffRole({ profileId: person.id, role: to });
            if (r.error !== null) setError(r.error);
          })
        }
        className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors disabled:opacity-60 ${
          tone === "red"
            ? "bg-ink-950/5 text-ink-800/70 hover:bg-brand-600 hover:text-cream-50"
            : tone === "gold"
              ? "bg-gold-400 text-ink-950 ring-2 ring-ink-950 hover:bg-gold-300"
              : "bg-ink-950 text-cream-50 hover:bg-ink-800"
        }`}
      >
        {busy ? "…" : label}
      </button>
      {error && (
        <p className="w-full text-xs font-semibold text-brand-600">{error}</p>
      )}
    </>
  );
}

/**
 * Deleting an account, with the name typed out.
 *
 * A confirm button under a thumb at the counter is one mis-tap. A name is
 * not, and it also makes the person read who they are about to delete —
 * which is the actual failure this guards against, deleting the wrong row on
 * a list of similar-looking ones.
 *
 * The dialog leads with what survives rather than what goes, because that is
 * the part people get wrong: "delete" sounds like the sales disappear, and
 * they do not. They are the shop's records.
 */
/**
 * Changing somebody's sign-in email, for them.
 *
 * Staff cannot do this themselves, and that is the design: an account able
 * to move its own email is an account somebody can take over — change the
 * address, then ask to reset the password. What actually happens in a shop
 * is not "I would like a different email", it is "I have lost access to
 * mine and cannot get in", and the owner standing at the counter is a faster
 * and safer answer than any request flow.
 */
function EmailButton({ person }: { person: Person }) {
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <>
      <button
        onClick={() => {
          setAsking(true);
          setEmail("");
          setError(null);
        }}
        className="shrink-0 rounded-xl bg-ink-950/5 px-4 py-2 text-xs font-black uppercase tracking-wide text-ink-800/70 transition-colors hover:bg-ink-950 hover:text-cream-50"
      >
        Email
      </button>

      {asking && (
        <AdminDialog
          title={`Change the sign-in email for ${person.name ?? "this account"}`}
          subtitle="They sign in with this, and password resets go here."
          onClose={() => !busy && setAsking(false)}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-800/80">
              Use this when somebody has lost access to their old address. The
              new one works immediately — there is no confirmation link,
              because an inbox they cannot reach would leave the account
              unreachable from both.
            </p>
            <p className="text-sm font-semibold text-brand-600">
              Type it carefully. A typo here locks them out until you change it
              again.
            </p>

            <Field label="New sign-in email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoFocus
                placeholder="them@example.com"
                className={inputClass}
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy || !email.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const r = await setStaffEmail({
                      profileId: person.id,
                      email,
                    });
                    if (r.error !== null) setError(r.error);
                    else setAsking(false);
                  })
                }
                className="rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-60"
              >
                {busy ? "Changing…" : "Change it"}
              </button>
              <button
                disabled={busy}
                onClick={() => setAsking(false)}
                className="rounded-full px-5 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

function DeleteButton({ person }: { person: Person }) {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <>
      <button
        onClick={() => {
          setAsking(true);
          setTyped("");
          setError(null);
        }}
        className="shrink-0 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide text-brand-600 ring-1 ring-brand-600/30 transition-colors hover:bg-brand-600 hover:text-cream-50"
      >
        Delete
      </button>

      {asking && (
        <AdminDialog
          title={`Delete ${person.name ?? "this account"}?`}
          subtitle="This cannot be undone."
          onClose={() => !busy && setAsking(false)}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-800/80">
              <strong className="text-ink-950">What stays:</strong> every sale
              they rang up, every shift they worked, and every line in the
              activity log. Those are the shop&apos;s records, not theirs.
            </p>
            <p className="text-sm text-ink-800/80">
              <strong className="text-ink-950">What goes:</strong> their
              sign-in, their name and number, and any device they were allowed.
              Their old shifts will read &ldquo;A former account&rdquo; from
              then on.
            </p>

            <Field
              label="Type their name to confirm"
              hint={person.name ?? "This account has no name saved."}
            >
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                placeholder={person.name ?? ""}
                className={inputClass}
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    const r = await deleteStaffAccount({
                      profileId: person.id,
                      confirmName: typed,
                    });
                    if (r.error !== null) setError(r.error);
                    else setAsking(false);
                  })
                }
                className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Delete for good"}
              </button>
              <button
                disabled={busy}
                onClick={() => setAsking(false)}
                className="rounded-full px-5 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

export function StaffView({
  people,
  candidates,
  reports,
  ownerId,
}: {
  people: Person[];
  candidates: Person[];
  reports: ShiftReport[];
  ownerId: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [who, setWho] = useState<string>("all");

  const onShift = people.filter((p) => p.onShift);
  // Just the person filter now. The recent/see-more/date-range behaviour is
  // HistoryList's, shared with the money ledger and whatever wants it next —
  // it was written here first and copied once, which is one copy too many.
  const mine = useMemo(
    () => (who === "all" ? reports : reports.filter((r) => r.staffId === who)),
    [reports, who]
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className={hqTitle}>Staff</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Who works here, the hours they kept, and what each shift rang up.
        </p>
      </div>

      <section className="rounded-3xl bg-ink-950 p-6 text-cream-50">
        <h3 className="font-display text-xl font-black">
          {onShift.length === 0
            ? "Nobody is clocked in"
            : `On shift now: ${onShift.map((p) => p.name ?? "Someone").join(", ")}`}
        </h3>
        <p className="mt-1 text-sm text-cream-100/60">
          {onShift.length === 0
            ? "Staff clock in from the bottom of the sidebar."
            : "Sales rung up on the counter are stamped with the shift they happened in."}
        </p>
      </section>

      {/* Who works here */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-black text-ink-950">
            The team ({people.length})
          </h3>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-2xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
          >
            {showAdd ? "Done" : "+ Give someone access"}
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {people.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream-100 px-4 py-3 ring-1 ring-ink-950/10"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink-950">
                  {p.name ?? "No name set"}
                  {p.onShift && (
                    <span className="ml-2 rounded-full bg-jade-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cream-50">
                      On shift
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-800/50">
                  {p.role === "customer" ? "No access" : ROLE_LABELS[p.role]}
                  {p.phone && ` · ${p.phone}`}
                  {p.shiftsWorked > 0 && ` · ${p.shiftsWorked} shift${p.shiftsWorked === 1 ? "" : "s"}`}
                </p>
                {p.role !== "customer" && (
                  <p className="mt-0.5 max-w-md text-xs text-ink-800/40">
                    {ROLE_BLURBS[p.role]}
                  </p>
                )}
              </div>
              {/* The whole ladder, not one toggle. With only "make staff" and
                  "stand down" there was nowhere to put somebody who runs a
                  service but shouldn't see the books — which is most of the
                  people a stall actually promotes. */}
              {p.id !== ownerId && p.role !== "owner" && (
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {p.role !== "staff" && (
                    <RoleButton person={p} to="staff" label="Staff" tone="dark" />
                  )}
                  {p.role !== "manager" && (
                    <RoleButton person={p} to="manager" label="Manager" tone="dark" />
                  )}
                  {/* Co-owner. Gold, and last, because it is the heaviest
                      button on the screen — and it is here at all because
                      one owner account means every recovery runs through the
                      database dashboard, and if that is lost too there is no
                      way back in. Two owners can always restore each other.

                      Like every other role it is an offer: they accept it on
                      their own account, from their own sign-in. */}
                  <EmailButton person={p} />
                  {p.role !== "customer" && (
                    <RoleButton person={p} to="owner" label="Make co-owner" tone="gold" />
                  )}
                  {p.role !== "customer" && (
                    <RoleButton person={p} to="customer" label="Stand down" tone="red" />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {showAdd && (
          <div className="mt-4 rounded-3xl border-2 border-dashed border-ink-950/15 p-5">
            <p className="text-sm text-ink-800/70">
              <strong className="text-ink-950">
                There is no invite email — and that&apos;s deliberate.
              </strong>{" "}
              Have them sign up on the site like a customer, with their own
              email and their own password. Then give them access here. Nobody
              shares a login, so every shift and every sale belongs to a real
              person.
            </p>
            <p className="mt-3 text-sm text-ink-800/60">
              Anybody you stand down appears here too, without access — so
              this is also where an account gets deleted for good.
            </p>
            {candidates.length === 0 ? (
              <p className="mt-3 text-sm text-ink-800/50">
                No other accounts yet.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {candidates.slice(0, 25).map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream-100 px-4 py-2.5 ring-1 ring-ink-950/10"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink-950">
                        {p.name ?? "No name set"}
                      </p>
                      <p className="text-xs text-ink-800/50">{p.phone ?? "No number"}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <RoleButton person={p} to="staff" label="Make staff" tone="dark" />
                      <RoleButton person={p} to="manager" label="Make manager" tone="dark" />
                      {/* Deleting is only offered here, on accounts with no
                          access — so it is always two decisions: stand them
                          down, then delete. The first one can be undone. */}
                      <DeleteButton person={p} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Shifts */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-black text-ink-950">
            Recent shifts
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setWho("all")}
              aria-pressed={who === "all"}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                who === "all"
                  ? "bg-ink-950 text-cream-50"
                  : "bg-cream-100 text-ink-800/60 ring-1 ring-ink-950/10 hover:bg-cream-200"
              }`}
            >
              Everyone
            </button>
            {people
              .filter((p) => p.shiftsWorked > 0)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => setWho(p.id)}
                  aria-pressed={who === p.id}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    who === p.id
                      ? "bg-ink-950 text-cream-50"
                      : "bg-cream-100 text-ink-800/60 ring-1 ring-ink-950/10 hover:bg-cream-200"
                  }`}
                >
                  {p.name ?? "Someone"}
                </button>
              ))}
          </div>
        </div>

        <HistoryList
          className="mt-4"
          items={mine}
          keyOf={(r) => r.id}
          dateOf={(r) => r.startedAt}
          initial={3}
          noun="shifts"
          empty="No shifts recorded yet. They start appearing the first time someone clocks in from the sidebar."
          render={(r) => <ShiftCard r={r} />}
        />
      </section>

      <p className="text-xs text-ink-800/45">
        Only cash sales are expected in the drawer — GCash never was, so it
        isn&apos;t counted against it. A blank drawer count means nobody
        counted, which is not the same as counting nothing.
      </p>
    </div>
  );
}
