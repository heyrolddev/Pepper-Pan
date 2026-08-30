"use client";

import { useMemo } from "react";
import {
  addDays,
  canScheduleFor,
  formatClock,
  manilaNow,
  parseManilaLocal,
  type Closure,
  type DayHours,
  type OpenState,
  type ShopSettings,
} from "@/lib/hours";

/**
 * When the order is for.
 *
 * A closed shop is not a shop that takes no orders — it's a shop that can't
 * cook one *right now*. Advance orders are also where the bulk and party
 * orders live, which are the most valuable ones the shop gets.
 */
export function OrderTiming({
  state,
  settings,
  hours,
  closures,
  value,
  onChange,
  mustSchedule,
}: {
  state: OpenState;
  settings: ShopSettings;
  hours: DayHours[];
  closures: Closure[];
  value: string | null;
  onChange: (next: string | null) => void;
  mustSchedule: boolean;
}) {
  // A sensible first suggestion: the soonest slot the shop could actually
  // take, so the picker doesn't open on a time that's already refused.
  const earliest = useMemo(
    () => firstBookableSlot(hours, closures, settings),
    [hours, closures, settings]
  );

  const check =
    value != null
      ? canScheduleFor(parseManilaLocal(value), hours, closures, settings)
      : null;

  const canOrderNow = state.isOpen;

  return (
    <fieldset
      className={`flex flex-col gap-3 rounded-3xl p-5 ring-1 ${
        mustSchedule ? "bg-gold-50 ring-gold-400/60" : "bg-cream-100 ring-ink-950/10"
      }`}
    >
      <legend className="px-1 text-xs font-bold uppercase tracking-widest text-ink-800">
        When do you want it?
      </legend>

      {!canOrderNow && (
        <p className="rounded-2xl bg-cream-50 px-4 py-3 text-sm font-semibold text-ink-800 ring-1 ring-ink-950/10">
          {state.reason}
          {state.opensNext && (
            <span className="block font-normal text-ink-800/65">
              {state.opensNext}
            </span>
          )}
          {settings.accepting_orders && (
            <span className="mt-1 block font-normal text-ink-800/65">
              You can still order ahead — pick a time below.
            </span>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canOrderNow}
          onClick={() => onChange(null)}
          className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value === null && canOrderNow
              ? "bg-brand-600 text-cream-50"
              : "bg-cream-50 text-ink-800 ring-1 ring-ink-950/15"
          }`}
        >
          As soon as you can
        </button>
        <button
          type="button"
          onClick={() => onChange(value ?? earliest ?? "")}
          className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
            value !== null
              ? "bg-brand-600 text-cream-50"
              : "bg-cream-50 text-ink-800 ring-1 ring-ink-950/15"
          }`}
        >
          Order ahead
        </button>
      </div>

      {value !== null && (
        <div className="flex flex-col gap-2">
          <input
            type="datetime-local"
            value={value}
            min={earliest ?? undefined}
            onChange={(e) => onChange(e.target.value)}
            className="self-start rounded-2xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2.5 text-sm font-semibold text-ink-950 outline-none focus:border-brand-600"
          />
          {check && !check.ok ? (
            <p className="text-sm font-semibold text-brand-700">{check.reason}</p>
          ) : (
            <p className="text-[11px] text-ink-800/55">
              {settings.min_lead_hours > 0
                ? `At least ${settings.min_lead_hours} hour${settings.min_lead_hours === 1 ? "" : "s"} ahead, `
                : ""}
              up to {settings.max_days_ahead} days from now. Times must fall
              inside our opening hours.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

/**
 * The soonest slot the shop would actually accept.
 *
 * Walks forward from the lead time in half-hour steps rather than reasoning
 * about the calendar — at a fortnight's horizon that's a few hundred cheap
 * checks, and it can't disagree with the rule that does the refusing.
 */
function firstBookableSlot(
  hours: DayHours[],
  closures: Closure[],
  settings: ShopSettings
): string | null {
  if (hours.length === 0) return null;

  const now = new Date();
  const start = new Date(now.getTime() + settings.min_lead_hours * 3600_000);
  // Round up to the next half hour — nobody books for 3:07.
  start.setMinutes(start.getMinutes() > 30 ? 60 : 30, 0, 0);

  for (let step = 0; step < settings.max_days_ahead * 48; step++) {
    const candidate = new Date(start.getTime() + step * 30 * 60_000);
    if (canScheduleFor(candidate, hours, closures, settings, now).ok) {
      return toLocalInputValue(candidate);
    }
  }

  return null;
}

/**
 * A `datetime-local` value for this instant, in Manila time.
 *
 * The input has no timezone, so the string has to already be the shop's wall
 * clock — otherwise a customer abroad picks 6pm and books 6pm their time.
 */
function toLocalInputValue(at: Date): string {
  const m = manilaNow(at);
  const hh = String(Math.floor(m.minutes / 60)).padStart(2, "0");
  const mm = String(m.minutes % 60).padStart(2, "0");
  return `${m.date}T${hh}:${mm}`;
}

/** Kept alongside the picker so both agree on what "tomorrow" means. */
export { addDays, formatClock };
