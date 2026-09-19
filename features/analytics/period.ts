import { addMonthsClamped, daysBetween, startOfMonth, type ISODate } from '@/lib/dates';

/**
 * The Analytics screen's arithmetic — pure, so it is tested without a phone
 * (`__tests__/period.test.ts`). SQL returns sums; everything here works on
 * those few numbers, never on rows.
 */

/** The trend ranges the screen offers, in months. */
export const RANGES = [3, 6, 12, 24] as const;
export type RangeMonths = (typeof RANGES)[number];

/** 'YYYY-MM' moved by `n` months. */
export function shiftMonth(key: string, n: number): string {
  return addMonthsClamped(`${key}-01`, n).slice(0, 7);
}

/** `count` consecutive month keys starting at `first`, oldest first. */
export function monthKeys(first: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => shiftMonth(first, i));
}

export interface PeriodWindow {
  /** First month in the range, 'YYYY-MM'. The range runs to the current month inclusive. */
  firstMonth: string;
  /** The first day of `firstMonth`. */
  start: ISODate;
}

/** The last `months` calendar months including the current one. */
export function periodWindow(months: number, today: ISODate): PeriodWindow {
  const start = addMonthsClamped(startOfMonth(today), -(Math.max(1, months) - 1));
  return { firstMonth: start.slice(0, 7), start };
}

/**
 * How many days the period has actually been running, for "average per day".
 *
 * From the later of the window's first day and the ledger's first
 * transaction, through today, inclusive. Without the clamp a ledger started
 * last week, viewed over 24 months, would divide a week's spend by 730 days
 * and report a meaninglessly tiny average.
 */
export function activeDays(windowStart: ISODate, earliest: ISODate | null, today: ISODate): number {
  const from = earliest != null && earliest > windowStart ? earliest : windowStart;
  if (from > today) return 1;
  return daysBetween(from, today) + 1;
}

/** Average per day in whole paise — rounded once, never a fractional paisa. */
export function perDayPaise(totalPaise: number, days: number): number {
  return days > 0 ? Math.round(totalPaise / days) : 0;
}

/**
 * Share of income kept, as a percentage (may be negative when spending
 * exceeded income). Null when there was no income: 0% would claim nothing
 * was saved, and -∞ is not a number anyone can read.
 */
export function savingsRate(incomePaise: number, expensePaise: number): number | null {
  if (incomePaise <= 0) return null;
  return ((incomePaise - expensePaise) / incomePaise) * 100;
}

export interface CategoryTotal {
  id: number | null;
  name: string | null;
  color: string | null;
  icon: string | null;
  totalPaise: number;
}

export interface Slice extends CategoryTotal {
  /** Stable key for React and selection: the category id, 'none' or 'other'. */
  key: string;
  /** 0–1 of the total. */
  share: number;
  /** How many categories an "Other" slice folds together (1 for a real category). */
  members: number;
}

/**
 * Turn per-category totals (largest first, from SQL) into donut slices.
 *
 * Past `maxSlices` the tail folds into one "Other" slice: a donut with
 * fifteen hairline segments shows nothing. The fold happens only when it
 * saves at least two slices — "Other" standing in for a single category would
 * hide that category's name for no gain.
 */
export function toSlices(rows: CategoryTotal[], maxSlices = 6): Slice[] {
  const live = rows.filter((r) => r.totalPaise > 0);
  const total = live.reduce((a, r) => a + r.totalPaise, 0);
  if (total === 0) return [];

  const slice = (r: CategoryTotal, key: string, members: number): Slice => ({
    ...r,
    key,
    members,
    share: r.totalPaise / total,
  });

  if (live.length <= maxSlices) {
    return live.map((r) => slice(r, r.id == null ? 'none' : String(r.id), 1));
  }

  const head = live.slice(0, maxSlices - 1);
  const tail = live.slice(maxSlices - 1);
  const otherPaise = tail.reduce((a, r) => a + r.totalPaise, 0);
  return [
    ...head.map((r) => slice(r, r.id == null ? 'none' : String(r.id), 1)),
    slice({ id: null, name: 'Other', color: null, icon: null, totalPaise: otherPaise }, 'other', tail.length),
  ];
}

/**
 * Clamp a month the user is browsing to the months that can hold data: never
 * after the current month, never before the ledger's first month.
 */
export function clampMonth(key: string, earliestMonth: string | null, currentMonth: string): string {
  if (key > currentMonth) return currentMonth;
  if (earliestMonth != null && key < earliestMonth) return earliestMonth;
  return key;
}
