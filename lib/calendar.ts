import { addDays, addMonthsClamped, daysInMonth, startOfMonth, toISODate, type ISODate } from './dates';

/**
 * Calendar grid maths for the date picker — pure, so it is tested in Node.
 *
 * The picker is built in JavaScript rather than with a native picker module.
 * Two reasons: a native module means a new APK before anything in the app can
 * be tested again, and the OS picker paints itself in the SYSTEM theme, which
 * is not necessarily the theme the user chose in Settings (lib/themeStore).
 * A grid of dates is a small amount of arithmetic and all of it lives here.
 */

/** Sunday-first, matching the WEEKDAYS labels used elsewhere in the app. */
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** 6 weeks × 7 days: enough to cover any month in any alignment. */
export const GRID_DAYS = 42;

/**
 * The 42 dates to draw for `month` ('YYYY-MM'), starting on the Sunday on or
 * before the 1st. Leading and trailing dates belong to the neighbouring
 * months — `inMonth` tells them apart, and they stay tappable so a date near
 * a boundary does not need a month change.
 */
export function monthGrid(month: string): ISODate[] {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00`).getDay();
  const start = addDays(first, -weekday);
  return Array.from({ length: GRID_DAYS }, (_, i) => addDays(start, i));
}

/** Whether `date` falls inside `month` ('YYYY-MM'). */
export function inMonth(date: ISODate, month: string): boolean {
  return date.slice(0, 7) === month;
}

/** Shift a month key by `n` months. '2026-01' + 1 → '2026-02'. */
export function shiftMonthKey(month: string, n: number): string {
  return addMonthsClamped(`${month}-01`, n).slice(0, 7);
}

/**
 * Every month key from `from` to `to` inclusive, oldest first.
 *
 * This is the strip along the top of the picker. It is what makes the review's
 * "any date in the past two years in at most three taps" achievable: open the
 * picker, pick the month, pick the day — no repeated tapping of a ‹ arrow.
 */
export function monthRange(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let m = from;
  // Guard against a runaway loop if a caller passes something malformed.
  for (let i = 0; i < 1200 && m <= to; i++) {
    out.push(m);
    m = shiftMonthKey(m, 1);
  }
  return out;
}

/** Clamp a date into [min, max]; either bound may be omitted. */
export function clampDate(date: ISODate, min?: ISODate, max?: ISODate): ISODate {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/**
 * The same day in another month, clamped to that month's length, so stepping
 * from 31 March back a month lands on 28/29 February rather than overflowing.
 */
export function sameDayInMonth(date: ISODate, month: string): ISODate {
  const day = Number(date.slice(8, 10));
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return toISODate(new Date(year, m - 1, Math.min(day, daysInMonth(year, m))));
}

/** The month a picker should open on for `value`, kept inside the strip. */
export function openingMonth(value: ISODate, from: string, to: string): string {
  const month = startOfMonth(value).slice(0, 7);
  if (month < from) return from;
  if (month > to) return to;
  return month;
}
