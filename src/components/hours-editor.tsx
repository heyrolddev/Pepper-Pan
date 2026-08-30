"use client";

import { useState } from "react";
import {
  saveHours,
  saveShopSettings,
  addClosure,
  removeClosure,
} from "@/app/admin/hours/actions";
import {
  DAY_NAMES,
  formatClock,
  type Closure,
  type DayHours,
  type ShopSettings,
} from "@/lib/hours";
import { formatDate } from "@/lib/format-date";

const field =
  "rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm font-semibold text-ink-950 outline-none focus:border-brand-600";

// Monday-first: it's how a shop thinks about its week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursEditor({
  hours,
  closures,
  settings,
}: {
  hours: DayHours[];
  closures: Closure[];
  settings: ShopSettings;
}) {
  const [days, setDays] = useState<DayHours[]>(hours);
  const [error, setError] = useState<string | null>(null);
  const [savedDays, setSavedDays] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(weekday: number, patch: Partial<DayHours>) {
    setDays((prev) =>
      prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d))
    );
    setSavedDays(false);
  }

  /** Set every open day to the same window — most stalls keep one schedule. */
  function applyToAll(from: DayHours) {
    setDays((prev) =>
      prev.map((d) => (d.is_open ? { ...d, opens: from.opens, closes: from.closes } : d))
    );
    setSavedDays(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await saveHours(days);
    setBusy(false);
    if (res.error) return setError(res.error);
    setSavedDays(true);
    setTimeout(() => setSavedDays(false), 2500);
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      <PauseCard settings={settings} onError={setError} />

      <section className="flex flex-col gap-3 rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
        <div>
          <h3 className="font-display text-lg font-black text-ink-950">Your week</h3>
          <p className="text-sm text-ink-800/60">
            Outside these hours the site tells customers you&apos;re closed and
            won&apos;t take an order for right now — they can still order ahead.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {WEEK_ORDER.map((weekday) => {
            const day = days.find((d) => d.weekday === weekday);
            if (!day) return null;
            return (
              <li
                key={weekday}
                className={`flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 ${
                  day.is_open ? "bg-cream-50" : "bg-cream-50/50"
                } ring-1 ring-ink-950/10`}
              >
                <label className="flex w-32 shrink-0 items-center gap-2 font-bold text-ink-950">
                  <input
                    type="checkbox"
                    checked={day.is_open}
                    onChange={(e) => update(weekday, { is_open: e.target.checked })}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {DAY_NAMES[weekday]}
                </label>

                {day.is_open ? (
                  <>
                    <input
                      type="time"
                      value={day.opens.slice(0, 5)}
                      onChange={(e) => update(weekday, { opens: e.target.value })}
                      className={field}
                    />
                    <span className="text-ink-800/50">to</span>
                    <input
                      type="time"
                      value={day.closes.slice(0, 5)}
                      onChange={(e) => update(weekday, { closes: e.target.value })}
                      className={field}
                    />
                    <button
                      type="button"
                      onClick={() => applyToAll(day)}
                      className="text-xs font-bold text-brand-700 hover:underline"
                    >
                      Use for every open day
                    </button>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-ink-800/50">Closed</span>
                )}
              </li>
            );
          })}
        </ul>

        <button
          onClick={save}
          disabled={busy}
          className={`self-start rounded-full px-6 py-3 font-bold transition-colors disabled:opacity-60 ${
            savedDays ? "bg-jade-600 text-cream-50" : "bg-brand-600 text-cream-50"
          }`}
        >
          {busy ? "Saving…" : savedDays ? "Saved ✓" : "Save hours"}
        </button>
      </section>

      <ClosuresCard closures={closures} onError={setError} />
    </div>
  );
}

function PauseCard({
  settings,
  onError,
}: {
  settings: ShopSettings;
  onError: (m: string) => void;
}) {
  const [accepting, setAccepting] = useState(settings.accepting_orders);
  const [message, setMessage] = useState(settings.paused_message ?? "");
  const [lead, setLead] = useState(settings.min_lead_hours);
  const [ahead, setAhead] = useState(settings.max_days_ahead);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(next?: boolean) {
    const acceptingNow = next ?? accepting;
    setBusy(true);
    const res = await saveShopSettings({
      acceptingOrders: acceptingNow,
      pausedMessage: message,
      minLeadHours: lead,
      maxDaysAhead: ahead,
    });
    setBusy(false);
    if (res.error) return onError(res.error);
    setAccepting(acceptingNow);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section
      className={`flex flex-col gap-4 rounded-3xl p-5 ring-2 ${
        accepting ? "bg-cream-100 ring-jade-600/30" : "bg-brand-50 ring-brand-600"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-black text-ink-950">
            {accepting ? "Taking orders" : "Orders paused"}
          </h3>
          <p className="mt-0.5 max-w-md text-sm text-ink-800/65">
            {accepting
              ? "Pull this the moment you run out or the kitchen goes down — it beats the clock, whatever your hours say."
              : "Nobody can order right now. Customers see your message below."}
          </p>
        </div>
        <button
          onClick={() => save(!accepting)}
          disabled={busy}
          className={`shrink-0 rounded-full px-6 py-3 font-bold transition-transform hover:scale-105 disabled:opacity-60 ${
            accepting ? "bg-brand-600 text-cream-50" : "bg-jade-600 text-cream-50"
          }`}
        >
          {accepting ? "Pause orders" : "Start taking orders"}
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-ink-800">
        What customers see when paused
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ubos na po ang noodles — bukas ulit!"
          className={`${field} font-normal normal-case tracking-normal`}
        />
      </label>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          Order ahead at least
          <input
            type="number"
            min={0}
            max={168}
            value={lead}
            onChange={(e) => setLead(Number(e.target.value))}
            className={`${field} w-20`}
          />
          hours
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          Up to
          <input
            type="number"
            min={1}
            max={90}
            value={ahead}
            onChange={(e) => setAhead(Number(e.target.value))}
            className={`${field} w-20`}
          />
          days ahead
        </label>
        <button
          onClick={() => save()}
          disabled={busy}
          className={`rounded-full px-5 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
            saved ? "bg-jade-600 text-cream-50" : "bg-ink-950 text-cream-50"
          }`}
        >
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </section>
  );
}

function ClosuresCard({
  closures,
  onError,
}: {
  closures: Closure[];
  onError: (m: string) => void;
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const res = await addClosure(date, reason);
    setBusy(false);
    if (res.error) return onError(res.error);
    setDate("");
    setReason("");
  }

  async function drop(closedOn: string) {
    setBusy(true);
    const res = await removeClosure(closedOn);
    setBusy(false);
    if (res.error) onError(res.error);
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <div>
        <h3 className="font-display text-lg font-black text-ink-950">Days you&apos;re closed</h3>
        <p className="text-sm text-ink-800/60">
          A fiesta, a family day, a delivery that didn&apos;t arrive. Beats editing
          your weekly hours and forgetting to put them back.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={field}
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional) — customers see this"
          className={`${field} min-w-56 flex-1 font-normal`}
        />
        <button
          onClick={add}
          disabled={busy || !date}
          className="rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {closures.length === 0 ? (
        <p className="text-sm text-ink-800/50">Nothing coming up.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {closures.map((c) => (
            <li
              key={c.closed_on}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream-50 px-4 py-2.5 ring-1 ring-ink-950/10"
            >
              <span className="font-bold text-ink-950">{formatDate(c.closed_on)}</span>
              {c.reason && (
                <span className="text-sm text-ink-800/65">{c.reason}</span>
              )}
              <button
                onClick={() => drop(c.closed_on)}
                disabled={busy}
                className="ml-auto text-xs font-bold text-brand-700 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A one-line summary of today, for the page header. */
export function TodayLine({ day }: { day: DayHours | null }) {
  if (!day) return null;
  return (
    <span>
      {day.is_open
        ? `Today: ${formatClock(day.opens)}–${formatClock(day.closes)}`
        : "Closed today"}
    </span>
  );
}
