/**
 * Date handling. Everything in the database is a 'YYYY-MM-DD' TEXT string
 * (CLAUDE.md #3), so these helpers work in that space and only touch Date
 * objects internally.
 *
 * Two calculations here are the most bug-prone code in the project, and both
 * are pure functions specifically so they can be tested exhaustively:
 *
 *   - budget cycle windows (a reset day of 15 spans two calendar months)
 *   - subscription renewal (advance an anchor by a cycle, clamped to month end)
 */

export type ISODate = string; // 'YYYY-MM-DD'

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse 'YYYY-MM-DD' into a LOCAL midnight Date.
 *
 * Deliberately not `new Date(str)`: that parses a bare date string as UTC,
 * so in IST (+05:30) it yields the previous day at 18:30 local, and every
 * date in the app silently shifts by one. This bug is a classic.
 */
export function fromISODate(s: ISODate): Date {
  const parts = s.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return new Date(y, m - 1, d);
}

/** Milliseconds from `now` until one second past the next local midnight (at least 1 s). */
export function msUntilNextMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1_000, next.getTime() - now.getTime());
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

/**
 * The one timestamp format the database stores: `2026-09-14T10:11:12.345Z`.
 *
 * It matches the schema's column default, `strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
 * character for character, so rows written by SQLite and rows written by app
 * code compare correctly as text. (Before migration 0003, defaults produced
 * `2026-09-14 10:11:12` — a space sorts before `T`, which broke comparisons.)
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Days in a given month. `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Whole days from `a` to `b`. Negative when b is before a. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const MS_PER_DAY = 86_400_000;
  const da = fromISODate(a).getTime();
  const db = fromISODate(b).getTime();
  return Math.round((db - da) / MS_PER_DAY);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/**
 * Add months, clamping the day to the target month's length.
 * '2026-01-31' + 1 month -> '2026-02-28' (not 2026-03-03, which is what
 * naive Date arithmetic produces by overflowing).
 */
export function addMonthsClamped(s: ISODate, n: number): ISODate {
  const d = fromISODate(s);
  const targetDay = d.getDate();
  const targetMonthIndex = d.getMonth() + n;

  const year = d.getFullYear() + Math.floor(targetMonthIndex / 12);
  const monthIndex = ((targetMonthIndex % 12) + 12) % 12;

  const maxDay = daysInMonth(year, monthIndex + 1);
  const day = Math.min(targetDay, maxDay);

  return toISODate(new Date(year, monthIndex, day));
}

/** 'YYYY-MM' — the month key used by analytics GROUP BY substr(date,1,7). */
export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

/** First day of the month containing `s`. */
export function startOfMonth(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`;
}

/**
 * English month names, spelled out here rather than via toLocaleDateString:
 * labels must not change shape on a device whose ICU data is incomplete.
 */
export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** '2026-09-13' -> '13 Sep' */
export function formatDayMonth(s: ISODate): string {
  return `${Number(s.slice(8, 10))} ${MONTHS_SHORT[Number(s.slice(5, 7)) - 1]}`;
}

/** '2026-09' or '2026-09-13' -> 'September 2026' */
export function formatMonthYear(s: string): string {
  return `${MONTHS_LONG[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Budget cycles
// ---------------------------------------------------------------------------

export interface CycleWindow {
  /** Inclusive. */
  start: ISODate;
  /** Inclusive. */
  end: ISODate;
  daysTotal: number;
  daysLeft: number;
}

/**
 * The current cycle window for a budget that resets on `resetDay`.
 *
 * A budget resetting on the 1st behaves like a calendar month. One resetting
 * on the 15th runs 15 Mar -> 14 Apr, so it spans two calendar months, and
 * every "spent this cycle" query must use these bounds rather than a month.
 *
 * `resetDay` is clamped to the month length, so 31 means "last day of the
 * month" in February.
 */
export function getCycleWindow(resetDay: number, today: ISODate = todayISO()): CycleWindow {
  const t = fromISODate(today);
  const year = t.getFullYear();
  const month = t.getMonth() + 1; // 1-12
  const day = t.getDate();

  const clampedThisMonth = Math.min(resetDay, daysInMonth(year, month));

  let startYear = year;
  let startMonth = month;

  if (day < clampedThisMonth) {
    // Still inside the cycle that began last month.
    startMonth -= 1;
    if (startMonth === 0) {
      startMonth = 12;
      startYear -= 1;
    }
  }

  const startDay = Math.min(resetDay, daysInMonth(startYear, startMonth));
  const start = toISODate(new Date(startYear, startMonth - 1, startDay));

  // The cycle ends the day before the next reset.
  const nextStart = addMonthsClamped(start, 1);
  const end = addDays(nextStart, -1);

  return {
    start,
    end,
    daysTotal: daysBetween(start, end) + 1,
    daysLeft: Math.max(0, daysBetween(today, end)),
  };
}

// ---------------------------------------------------------------------------
// Subscription renewal
// ---------------------------------------------------------------------------

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * Next renewal date, computed on read. Port of the web app's `_enrich`.
 *
 * Advances `anchorDate` by the billing cycle until it lands on or after
 * `today`. Self-correcting, so no background job is needed: whatever the
 * anchor was, the answer is always the next real occurrence.
 *
 * Month-end clamping matters — a subscription anchored on 31 Jan renews on
 * 28 Feb, then 31 Mar, and must not drift to the 28th forever. Anchoring the
 * arithmetic to the ORIGINAL date rather than the last computed one is what
 * prevents that drift.
 */
export function getNextRenewal(anchorDate: ISODate, cycle: BillingCycle, today: ISODate = todayISO()): ISODate {
  if (daysBetween(today, anchorDate) >= 0) return anchorDate;

  if (cycle === 'weekly') {
    const diff = daysBetween(anchorDate, today);
    const weeks = Math.ceil(diff / 7);
    let next = addDays(anchorDate, weeks * 7);
    if (daysBetween(today, next) < 0) next = addDays(next, 7);
    return next;
  }

  const step = cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12;

  // Estimate how many steps we need, then walk the last one or two. Always
  // measuring from the original anchor keeps month-end dates from drifting.
  const a = fromISODate(anchorDate);
  const t = fromISODate(today);
  const monthsApart = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());

  let n = Math.max(0, Math.floor(monthsApart / step));
  let next = addMonthsClamped(anchorDate, n * step);

  // Walk forward until we are on or after today. Bounded to avoid any chance
  // of an infinite loop on malformed input.
  let guard = 0;
  while (daysBetween(today, next) < 0 && guard < 600) {
    n += 1;
    next = addMonthsClamped(anchorDate, n * step);
    guard += 1;
  }

  return next;
}

export type Urgency = 'ok' | 'soon' | 'muted';

/**
 * Urgency band for a renewal countdown. Value names match the web app's
 * ('ok' | 'soon' | 'muted') rather than colour names, so theming can change
 * without the data becoming a lie.
 */
export function getUrgency(daysUntil: number, isActive: boolean): Urgency {
  if (!isActive) return 'muted';
  return daysUntil <= 3 ? 'soon' : 'ok';
}

/**
 * Normalise any billing cycle to a monthly-equivalent cost, in paise.
 *
 * This one ROUNDS: a yearly plan has no exact monthly price, so the figure is
 * a display equivalent. Never multiply it back up — use `toYearlyPaise`.
 */
export function toMonthlyPaise(amountPaise: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'monthly':
      return amountPaise;
    case 'yearly':
      return Math.round(amountPaise / 12);
    case 'quarterly':
      return Math.round(amountPaise / 3);
    case 'weekly':
      return Math.round((amountPaise * 52) / 12);
  }
}

/**
 * The exact cost of a full year of a billing cycle, in paise.
 *
 * Multiplies the CHARGE, never the rounded monthly equivalent (B3). The old
 * `toMonthlyPaise(x) * 12` turned ₹1,499/year into ₹1,499.04: round(149900/12)
 * = 12492, and 12492 × 12 = 149904. Four paise is nothing as money and a great
 * deal as a signal — it is exactly the drift integer paise exists to prevent,
 * in the Tracker's headline figure.
 */
export function toYearlyPaise(amountPaise: number, cycle: BillingCycle): number {
  switch (cycle) {
    case 'monthly':
      return amountPaise * 12;
    case 'yearly':
      return amountPaise;
    case 'quarterly':
      return amountPaise * 4;
    case 'weekly':
      return amountPaise * 52;
  }
}
