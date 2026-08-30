/**
 * When the shop is open, and what that means for an order.
 *
 * Everything here works in Asia/Manila regardless of where the viewer is.
 * A customer on holiday abroad still orders against the stall's clock, and
 * the owner checking HQ at midnight shouldn't see tomorrow's hours.
 */

export type DayHours = {
  weekday: number; // 0 = Sunday, matching Date#getDay
  is_open: boolean;
  opens: string; // "10:00"
  closes: string; // "21:00"
};

export type ShopSettings = {
  accepting_orders: boolean;
  paused_message: string | null;
  min_lead_hours: number;
  max_days_ahead: number;
};

export type Closure = { closed_on: string; reason: string | null };

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MANILA = "Asia/Manila";

/** The shop's own wall clock, whatever the viewer's device thinks. */
export function manilaNow(at: Date = new Date()): {
  date: string; // YYYY-MM-DD
  weekday: number;
  minutes: number; // minutes since midnight
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    // Midnight comes back as "24" from some engines rather than "00".
    minutes: (hour === 24 ? 0 : hour) * 60 + Number(get("minute")),
  };
}

/**
 * Read a `datetime-local` value as the shop's wall clock.
 *
 * `new Date("2026-08-30T23:00")` is parsed in the *browser's* timezone, so a
 * customer whose phone is on another clock would have their 6pm booked as
 * someone else's 6pm — and the client would disagree with the server, which
 * pins the offset. Philippine time is UTC+8 with no daylight saving, so
 * stating it is exact rather than a guess.
 */
export function parseManilaLocal(value: string): Date {
  return new Date(`${value}:00+08:00`);
}

/** "21:30" → 1290. Anything unparseable is treated as midnight. */
export function toMinutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** 1290 → "9:30pm", the way the shop would say it. */
export function formatClock(clock: string): string {
  const total = toMinutes(clock);
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""}${h24 < 12 ? "am" : "pm"}`;
}

export type OpenState = {
  isOpen: boolean;
  /** Why not, in words a customer reads — null when open. */
  reason: string | null;
  /** "Opens 10am tomorrow" — null when open or when nothing is scheduled. */
  opensNext: string | null;
  /** Today's hours, for the banner. */
  today: DayHours | null;
};

/**
 * Is the shop open right now?
 *
 * A closure date beats the weekly hours, and the master switch beats both —
 * a broken fryer doesn't care what the schedule says.
 */
export function openState(
  hours: DayHours[],
  closures: Closure[],
  settings: ShopSettings,
  at: Date = new Date()
): OpenState {
  const now = manilaNow(at);
  const byDay = new Map(hours.map((h) => [h.weekday, h]));
  const today = byDay.get(now.weekday) ?? null;

  const closedToday = closures.find((c) => c.closed_on === now.date);

  const nextOpening = describeNextOpening(byDay, closures, now);

  if (!settings.accepting_orders) {
    return {
      isOpen: false,
      reason:
        settings.paused_message?.trim() ||
        "We've paused orders for now — please check back a little later.",
      opensNext: null,
      today,
    };
  }

  if (closedToday) {
    return {
      isOpen: false,
      reason: closedToday.reason?.trim()
        ? `Closed today — ${closedToday.reason.trim()}.`
        : "We're closed today.",
      opensNext: nextOpening,
      today,
    };
  }

  if (!today || !today.is_open) {
    return {
      isOpen: false,
      reason: `We're closed on ${DAY_NAMES[now.weekday]}s.`,
      opensNext: nextOpening,
      today,
    };
  }

  const opens = toMinutes(today.opens);
  const closes = toMinutes(today.closes);

  if (now.minutes < opens) {
    return {
      isOpen: false,
      reason: `We open at ${formatClock(today.opens)} today.`,
      opensNext: `Opens ${formatClock(today.opens)} today`,
      today,
    };
  }

  if (now.minutes >= closes) {
    return {
      isOpen: false,
      reason: `We closed at ${formatClock(today.closes)} today.`,
      opensNext: nextOpening,
      today,
    };
  }

  return { isOpen: true, reason: null, opensNext: null, today };
}

/** "Opens 10am tomorrow" / "Opens 10am on Friday" — the next real opening. */
function describeNextOpening(
  byDay: Map<number, DayHours>,
  closures: Closure[],
  now: ReturnType<typeof manilaNow>
): string | null {
  const closedDates = new Set(closures.map((c) => c.closed_on));

  // Start from tomorrow: today has already been ruled out by the caller.
  for (let ahead = 1; ahead <= 7; ahead++) {
    const weekday = (now.weekday + ahead) % 7;
    const day = byDay.get(weekday);
    if (!day?.is_open) continue;

    const date = addDays(now.date, ahead);
    if (closedDates.has(date)) continue;

    const when = ahead === 1 ? "tomorrow" : `on ${DAY_NAMES[weekday]}`;
    return `Opens ${formatClock(day.opens)} ${when}`;
  }

  return null;
}

/** Date arithmetic on a YYYY-MM-DD string, without dragging in a timezone. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Can an order be scheduled for this moment?
 *
 * Separate from `openState` on purpose: the shop being shut right now says
 * nothing about whether it can take an order for Saturday lunch — which is
 * exactly the order worth having.
 */
export function canScheduleFor(
  when: Date,
  hours: DayHours[],
  closures: Closure[],
  settings: ShopSettings,
  at: Date = new Date()
): { ok: true } | { ok: false; reason: string } {
  if (Number.isNaN(when.getTime())) {
    return { ok: false, reason: "Pick a date and time." };
  }

  const leadMs = settings.min_lead_hours * 3600_000;
  if (when.getTime() - at.getTime() < leadMs) {
    return {
      ok: false,
      reason:
        settings.min_lead_hours <= 1
          ? "Please give us at least an hour's notice."
          : `Please order at least ${settings.min_lead_hours} hours ahead.`,
    };
  }

  const maxMs = settings.max_days_ahead * 86_400_000;
  if (when.getTime() - at.getTime() > maxMs) {
    return {
      ok: false,
      reason: `We only take orders up to ${settings.max_days_ahead} days ahead.`,
    };
  }

  const slot = manilaNow(when);

  if (closures.some((c) => c.closed_on === slot.date)) {
    return { ok: false, reason: "We're closed that day — please pick another." };
  }

  const day = hours.find((h) => h.weekday === slot.weekday);
  if (!day?.is_open) {
    return {
      ok: false,
      reason: `We're closed on ${DAY_NAMES[slot.weekday]}s — please pick another day.`,
    };
  }

  const opens = toMinutes(day.opens);
  const closes = toMinutes(day.closes);
  if (slot.minutes < opens || slot.minutes >= closes) {
    return {
      ok: false,
      reason: `On ${DAY_NAMES[slot.weekday]}s we're open ${formatClock(day.opens)}–${formatClock(day.closes)}. Please pick a time in there.`,
    };
  }

  return { ok: true };
}

/** The whole week, for the assistant and the Visit section. */
export function describeWeek(hours: DayHours[]): string {
  const byDay = new Map(hours.map((h) => [h.weekday, h]));
  const lines: string[] = [];

  // Monday-first reads more naturally than Sunday-first to a shop.
  for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
    const day = byDay.get(weekday);
    if (!day) continue;
    lines.push(
      day.is_open
        ? `${DAY_NAMES[weekday]}: ${formatClock(day.opens)}–${formatClock(day.closes)}`
        : `${DAY_NAMES[weekday]}: closed`
    );
  }

  return lines.join("\n");
}
