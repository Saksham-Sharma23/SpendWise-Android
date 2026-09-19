import { categoryTotals, monthTrend } from '@/data/ledger/sql';
import type { AnyDb } from '@/db/types';
import { addMonthsClamped, startOfMonth, type ISODate } from '@/lib/dates';

/**
 * Home's month-shaped views of the shared ledger aggregates.
 *
 * The SQL itself lives in `@/data/ledger`, shared with Insights (R3-8). What
 * stays here is only what is particular to Home: "the last N months" and
 * "this month", both ending at the current month.
 *
 * Both ends are bounded (B1): the date picker allows a year ahead, and a row
 * dated next month once counted in "Where it went" and the insight banner's
 * share while the month total excluded it, so a share could exceed 100%.
 */

/** Income vs expense per month for the last `months` months, ending this month. */
export function trendQuery(db: AnyDb, months: number, today: ISODate) {
  const firstKey = addMonthsClamped(startOfMonth(today), -(months - 1)).slice(0, 7);
  return monthTrend(db, firstKey, today.slice(0, 7));
}

/** This month's biggest expense categories. */
export function topCategoriesQuery(db: AnyDb, today: ISODate, limit: number) {
  const month = today.slice(0, 7);
  return categoryTotals(db, month, month, limit);
}
