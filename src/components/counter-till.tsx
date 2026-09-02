"use client";

import { useMemo, useState, useTransition } from "react";
import { peso } from "@/lib/costing";
import { recordWalkInSale } from "@/app/admin/counter/actions";
import { categoryOf, colourOf, type MenuCategory } from "@/lib/categories";
import { changeFor, tenderSuggestions } from "@/lib/till";
import { hqTitle } from "@/lib/hq-theme";

export type CounterMeal = {
  id: string;
  name: string;
  price: number;
  categories: string[] | null;
  is_public: boolean;
  is_available: boolean;
  /** Servings the shelf can still make. Null when there's no recipe to go on. */
  makeable?: number | null;
};

/**
 * The till.
 *
 * Every screen in HQ so far has been for reading. This one is used standing
 * up, one-handed, with a queue waiting — which changes what "good design"
 * means. Big targets, no dropdowns, no confirmation dialog between a tap and
 * the total. The most expensive thing here is not an ugly layout, it's a
 * mis-tap that has to be undone while somebody holds a fifty-peso note.
 *
 * So: a running order that is always on screen, a quantity you can change
 * without deleting the line, and one obvious button that ends the sale.
 */

type Ticket = Record<string, number>;

export function CounterTill({
  meals,
  loadError,
  takenToday,
  salesToday,
  staffName,
  known = [],
}: {
  meals: CounterMeal[];
  loadError: string | null;
  takenToday: number;
  salesToday: number;
  staffName: string;
  /** Category colours, so the till reads the same way the menu does. */
  known?: MenuCategory[];
}) {
  const [ticket, setTicket] = useState<Ticket>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [method, setMethod] = useState<"cash" | "gcash">("cash");
  const [dineIn, setDineIn] = useState(false);
  // What was put on the counter. A string, not a number, so the box can be
  // empty — "nothing typed yet" and "zero pesos" are different answers.
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [toKitchen, setToKitchen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ total: number; dineIn: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(meals.map((m) => [m.id, m])), [meals]);

  const colours = useMemo(
    () => new Map(known.map((c) => [c.name, c.colour])),
    [known]
  );

  const categories = useMemo(() => {
    // Same order as the customer's menu, for the same reason the tiles are
    // big: someone standing at the counter is finding things by position and
    // colour, not by reading. Two screens that disagree about where Drinks
    // sits cost a second every order.
    const used = new Set(meals.map((m) => categoryOf(m.categories)));
    const ordered = known.map((c) => c.name).filter((n) => used.has(n));
    const rest = [...used].filter((n) => !ordered.includes(n)).sort();
    return ["All", ...ordered, ...rest];
  }, [meals, known]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meals.filter((m) => {
      if (category !== "All" && categoryOf(m.categories) !== category) return false;
      return !q || m.name.toLowerCase().includes(q);
    });
  }, [meals, query, category]);

  const lines = useMemo(
    () =>
      Object.entries(ticket)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ meal: byId.get(id)!, qty }))
        .filter((l) => l.meal),
    [ticket, byId]
  );
  const total = lines.reduce((s, l) => s + l.meal.price * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const bump = (id: string, by: number) =>
    setTicket((t) => {
      const next = Math.max(0, (t[id] ?? 0) + by);
      const copy = { ...t };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const clear = () => {
    setTicket({});
    setNote("");
    setReference("");
    setTendered("");
    setError(null);
  };

  function submit() {
    setError(null);
    startTransition(async () => {
      // Captured before the reset below, so the confirmation names the sale
      // that was actually recorded rather than the state of the next one.
      const wasDineIn = dineIn;
      const result = await recordWalkInSale({
        lines: lines.map((l) => ({ mealId: l.meal.id, qty: l.qty })),
        method,
        reference,
        toKitchen,
        dineIn,
        note,
      });
      // Checked against null rather than truthiness: an error type of
      // `string` includes "", so a plain `if (result.error)` doesn't narrow
      // the union and the success branch stays possibly-undefined.
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      // Cleared straight away: the next customer is already at the counter,
      // and a till that needs dismissing before it can take the next order is
      // a till that gets left on the last one.
      setDone({ total: result.total, dineIn: wasDineIn });
      // Back to take-out for the next customer. A payment method left on the
      // last choice is harmless; a "dine in" left on is a box, a cup and a bag
      // that quietly never come off the count, every sale, until somebody
      // notices the shelf disagreeing with the system.
      setDineIn(false);
      clear();
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={hqTitle}>Counter</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-800/60">
            Ring up someone at the stall. It lands in the same books as an
            online order, so the day&apos;s takings finally mean the whole day.
          </p>
        </div>
        <div className="rounded-2xl bg-cream-100 px-4 py-2.5 text-right ring-1 ring-ink-950/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/40">
            Counter sales today
          </p>
          <p className="font-display text-xl font-black tabular-nums text-ink-950">
            {peso(takenToday, 0)}
            <span className="ml-2 text-xs font-bold text-ink-800/40">
              {salesToday} sale{salesToday === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      </div>

      {loadError && (
        <p className="rounded-2xl bg-brand-600 px-5 py-4 text-sm text-cream-50">
          <strong>The menu didn&apos;t load.</strong> {loadError} — don&apos;t
          ring up from this screen until it does, or the prices will be wrong.
        </p>
      )}

      {done && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-jade-600 px-5 py-4 text-cream-50">
          <p className="font-display text-lg font-black">
            Recorded {peso(done.total, 0)} {done.dineIn ? "dine in" : "take out"}
            {toKitchen ? " — it's on the kitchen board." : " — in the day's takings."}
          </p>
          <button
            onClick={() => setDone(null)}
            className="rounded-full bg-ink-950/25 px-4 py-1.5 text-xs font-black uppercase tracking-wide"
          >
            Next customer
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ---- the menu ---------------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the menu…"
            className="rounded-xl bg-cream-100 px-4 py-3 text-base text-ink-950 ring-1 ring-ink-950/10 placeholder:text-ink-800/40 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const on = category === c;
              const tone = colourOf(c, colours);
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    on
                      ? c === "All"
                        ? "bg-ink-950 text-cream-50"
                        : tone.chip
                      : "bg-cream-100 text-ink-800/60 ring-1 ring-ink-950/10 hover:bg-cream-200"
                  }`}
                >
                  {!on && c !== "All" && (
                    <span aria-hidden className={`h-2 w-2 rounded-full ${tone.dot}`} />
                  )}
                  {c}
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
              Nothing here. {meals.length === 0 && "Every dish is marked sold out."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((m) => {
                const qty = ticket[m.id] ?? 0;
                // Never blocked at the till — the person is standing there
                // and the count may simply be behind. Flagged loudly instead,
                // and the server refuses if it is genuinely short.
                const out = m.makeable !== null && m.makeable !== undefined && m.makeable <= 0;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => bump(m.id, 1)}
                      className={`relative flex h-full w-full flex-col justify-between gap-2 rounded-2xl p-3 text-left transition-colors ${
                        qty > 0
                          ? "bg-ink-950 text-cream-50"
                          : "bg-cream-100 text-ink-950 ring-1 ring-ink-950/10 hover:bg-cream-200"
                      }`}
                    >
                      <span className="text-sm font-bold leading-tight">{m.name}</span>
                      <span className="font-display text-base font-black tabular-nums">
                        {peso(m.price, 0)}
                      </span>
                      {qty > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 grid h-7 min-w-7 place-items-center rounded-full bg-gold-400 px-1.5 font-display text-sm font-black tabular-nums text-ink-950 ring-2 ring-cream-50">
                          {qty}
                        </span>
                      )}
                      {out ? (
                        <span className="absolute bottom-1.5 right-2 rounded-full bg-brand-600 px-1.5 text-[9px] font-black uppercase tracking-wide text-cream-50">
                          no stock
                        </span>
                      ) : (
                        !m.is_public && (
                          <span className="absolute bottom-1.5 right-2 text-[9px] font-black uppercase tracking-wide opacity-40">
                            counter only
                          </span>
                        )
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ---- the ticket -------------------------------------------- */}
        <div id="counter-ticket" className="scroll-mt-4 lg:sticky lg:top-6 lg:self-start">
          <div className="flex flex-col rounded-3xl bg-cream-100 ring-1 ring-ink-950/10">
            <div className="flex items-baseline justify-between border-b border-ink-950/10 px-5 py-3">
              <h3 className="font-display text-lg font-black text-ink-950">
                This order
              </h3>
              {count > 0 && (
                <button
                  onClick={clear}
                  className="text-xs font-bold text-brand-600 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>

            {lines.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-800/40">
                Tap a dish to start.
              </p>
            ) : (
              <ul className="divide-y divide-ink-950/5">
                {lines.map((l) => (
                  <li key={l.meal.id} className="flex items-center gap-3 px-4 py-2.5">
                    {/* Wrapped, never truncated. Half this menu is
                        "… (Original)" against "… (SPICY)", and a name cut off
                        at "Burger Jipai w/ch…" is two different dishes that
                        look identical on the ticket — which is a wrong order
                        handed over, not a cosmetic problem. */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-tight text-ink-950">
                        {l.meal.name}
                      </p>
                      <p className="text-xs tabular-nums text-ink-800/50">
                        {peso(l.meal.price, 0)} each
                      </p>
                    </div>
                    {/* Minus and plus rather than a text field: a number pad on
                        a phone covers the ticket, and a typed quantity is one
                        fat finger away from 11 bowls. */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => bump(l.meal.id, -1)}
                        aria-label={`One less ${l.meal.name}`}
                        className="grid h-9 w-9 place-items-center rounded-lg bg-ink-950/5 font-black text-ink-950 hover:bg-ink-950/10"
                      >
                        −
                      </button>
                      <span className="w-7 text-center font-display text-base font-black tabular-nums text-ink-950">
                        {l.qty}
                      </span>
                      <button
                        onClick={() => bump(l.meal.id, 1)}
                        aria-label={`One more ${l.meal.name}`}
                        className="grid h-9 w-9 place-items-center rounded-lg bg-ink-950/5 font-black text-ink-950 hover:bg-ink-950/10"
                      >
                        +
                      </button>
                    </div>
                    <span className="w-16 shrink-0 text-right font-display text-sm font-black tabular-nums text-ink-950">
                      {peso(l.meal.price * l.qty, 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-3 border-t border-ink-950/10 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-ink-800/60">Total</span>
                <span className="font-display text-3xl font-black tabular-nums text-ink-950">
                  {peso(total, 0)}
                </span>
              </div>

              {/* Where the food is going, asked before how it's paid for —
                  because this is the answer the person at the counter has
                  already given out loud, and because it is what decides
                  whether a box, a sauce cup and a bag come off the shelf.
                  It replaces a second copy of the whole menu. */}
              <div>
                <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-ink-800/40">
                  Serving
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {([false, true] as const).map((d) => (
                    <button
                      key={String(d)}
                      onClick={() => setDineIn(d)}
                      aria-pressed={dineIn === d}
                      className={`rounded-xl py-2.5 text-sm font-black uppercase tracking-wide transition-colors ${
                        dineIn !== d
                          ? "bg-ink-950/5 text-ink-800/50 hover:bg-ink-950/10"
                          : d
                            // Red only on dine-in. Take-out is nearly every
                            // sale, and a till that shouts on the ordinary
                            // case teaches the eye to stop reading it — so
                            // the loud colour is saved for the setting that
                            // changes what comes off the shelf.
                            ? "bg-brand-600 text-cream-50"
                            : "bg-ink-950 text-cream-50"
                      }`}
                    >
                      {d ? "Dine in" : "Take out"}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-ink-800/40">
                  {dineIn
                    ? "Eating here — no packaging comes off the shelf."
                    : "Boxes, cups and a bag come off the shelf with it."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(["cash", "gcash"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    aria-pressed={method === m}
                    className={`rounded-xl py-2.5 text-sm font-black uppercase tracking-wide transition-colors ${
                      method === m
                        ? "bg-ink-950 text-cream-50"
                        : "bg-ink-950/5 text-ink-800/50 hover:bg-ink-950/10"
                    }`}
                  >
                    {m === "cash" ? "Cash" : "GCash"}
                  </button>
                ))}
              </div>

              {method === "gcash" && (
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="GCash reference no."
                  className="rounded-xl bg-cream-50 px-3 py-2.5 text-sm ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              )}

              {/* Counting out the change.
                  Cash only: a GCash payment is exact by construction — the
                  customer sends the amount — so a change box there would be a
                  field that is always zero and always in the way.
                  Nothing here is recorded. What the customer handed over is
                  not a fact about the business; the sale is the total, and the
                  drawer is counted at the end of the shift. This is arithmetic
                  done out loud so nobody has to do it in their head with a
                  queue waiting. */}
              {method === "cash" && lines.length > 0 && (
                <div className="rounded-xl bg-ink-950/[0.03] p-3">
                  <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-ink-800/40">
                    Cash received
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tenderSuggestions(total).map((amount, i) => {
                      const on = tendered === String(amount);
                      return (
                        <button
                          key={amount}
                          onClick={() => setTendered(on ? "" : String(amount))}
                          aria-pressed={on}
                          className={`rounded-lg px-3 py-2 text-sm font-black tabular-nums transition-colors ${
                            on
                              ? "bg-ink-950 text-cream-50"
                              : "bg-cream-50 text-ink-950 ring-1 ring-ink-950/10 hover:bg-cream-200"
                          }`}
                        >
                          {i === 0 ? "Exact" : peso(amount, 0)}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="Or type the amount"
                    aria-label="Cash received"
                    className="mt-2 w-full rounded-xl bg-cream-50 px-3 py-2.5 text-right font-display text-lg font-black tabular-nums ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                  <Change total={total} tendered={tendered} />
                </div>
              )}

              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional) — e.g. extra spicy"
                className="rounded-xl bg-cream-50 px-3 py-2.5 text-sm ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
              />

              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-ink-950/[0.03] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={toKitchen}
                  onChange={(e) => setToKitchen(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gold-400"
                />
                <span className="text-xs text-ink-800/70">
                  <strong className="text-ink-950">Send to the kitchen board</strong>
                  <span className="block">
                    For when they&apos;re waiting. Otherwise it&apos;s recorded
                    as a finished sale.
                  </span>
                </span>
              </label>

              {error && (
                <p className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-cream-50">
                  {error}
                </p>
              )}

              <button
                onClick={submit}
                disabled={pending || lines.length === 0}
                className="rounded-2xl bg-jade-600 py-4 font-display text-lg font-black text-cream-50 transition-colors hover:bg-jade-700 disabled:cursor-not-allowed disabled:bg-ink-950/15 disabled:text-ink-800/40"
              >
                {pending
                  ? "Recording…"
                  : lines.length === 0
                    ? "Nothing to record"
                    : `Take ${peso(total, 0)}`}
              </button>

              <p className="text-center text-[11px] text-ink-800/40">
                Recorded as {staffName}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* On a laptop the ticket is pinned beside the menu and always in view.
          On a phone it's underneath seventy-two tiles, so the running total
          and the button that ends the sale would be a long scroll away from
          the tapping — which is most of a service. This is the ticket's head,
          following you down the page. */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-950/10 bg-cream-50/95 px-4 py-3 backdrop-blur lg:hidden">
          <a
            href="#counter-ticket"
            className="flex items-center gap-3 rounded-2xl bg-jade-600 px-4 py-3 text-cream-50"
          >
            <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-cream-50/20 px-2 font-display text-sm font-black tabular-nums">
              {count}
            </span>
            <span className="flex-1 font-display text-xl font-black tabular-nums">
              {peso(total, 0)}
            </span>
            <span className="shrink-0 text-sm font-black uppercase tracking-wide">
              Review &amp; take →
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * What to hand back, said once and said big.
 *
 * This number gets read out loud while counting coins into somebody's palm,
 * often on a phone held at arm's length in daylight. It is the largest thing
 * in the panel for that reason — bigger than the total above it, because the
 * total has already been agreed and this one is still being acted on.
 *
 * Three states, three colours, and each says what to DO rather than what is
 * true: hand back this much, take this much more, or nothing to give back.
 * "Short" is not an error — money goes down in handfuls, and a till that
 * complains mid-count is a till that gets worked around.
 */
function Change({ total, tendered }: { total: number; tendered: string }) {
  const value = tendered.trim() === "" ? null : Number(tendered);
  const state = changeFor(total, value);
  // Whole pesos when it is whole, centavos when it isn't. Everywhere else in
  // HQ a headline figure drops the centavos, because there they never change
  // a decision — here they are the decision. Rounding ₱0.50 to "₱1" on the
  // one screen where somebody is about to count coins out of a drawer is the
  // software telling a small lie about money.
  const money = (n: number) => peso(n, Number.isInteger(n) ? 0 : 2);

  if (state.kind === "none") return null;

  if (state.kind === "short") {
    return (
      <p className="mt-2 flex items-baseline justify-between rounded-lg bg-brand-600 px-3 py-2 text-cream-50">
        <span className="text-sm font-bold">Still short</span>
        <span className="font-display text-2xl font-black tabular-nums">
          {money(state.short)}
        </span>
      </p>
    );
  }

  if (state.kind === "exact") {
    return (
      <p className="mt-2 rounded-lg bg-jade-600 px-3 py-2 text-center text-sm font-black uppercase tracking-wide text-cream-50">
        Exact — no change
      </p>
    );
  }

  return (
    <p className="mt-2 flex items-baseline justify-between rounded-lg bg-jade-600 px-3 py-2 text-cream-50">
      <span className="text-sm font-bold">Change</span>
      <span className="font-display text-3xl font-black tabular-nums">
        {money(state.change)}
      </span>
    </p>
  );
}
