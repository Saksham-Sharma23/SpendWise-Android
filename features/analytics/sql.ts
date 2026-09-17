import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { categories, transactions } from '../../db/schema';
import type * as schema from '../../db/schema';

/**
 * The Analytics query builders — every figure on the screen, aggregated in
 * SQL (CLAUDE.md #5). At most a couple of dozen rows ever cross into JS.
 *
 * Builders take the database as a parameter instead of closing over
 * db/read.ts, so the SAME builder runs on the phone (through readDb, off the
 * JS thread) and in Node against the real migrated schema
 * (`__tests__/sql.test.ts`) — the tests exercise the shipped SQL, not a copy.
 *
 * Every range filter is on the generated `month` column so SQLite walks
 * tx_month_idx (month, type, amount_paise) — the index that serves the
 * trend without a sort. `deleted_at IS NULL` is always present: that index is
 * partial, and a query that omits the predicate cannot use it.
 */

export type AnalyticsDb = BaseSQLiteDatabase<'sync' | 'async', any, typeof schema>;

const live = isNull(transactions.deletedAt);
const income = sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`;
const expense = sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`;

/**
 * Income and expense per month between `firstMonth` and `lastMonth`
 * ('YYYY-MM') inclusive, oldest first. Months with no rows are absent.
 */
export function trendQuery(db: AnalyticsDb, firstMonth: string, lastMonth: string) {
  return db
    .select({ month: sql<string>`${transactions.month}`, incomePaise: income, expensePaise: expense })
    .from(transactions)
    .where(and(live, gte(transactions.month, firstMonth), lte(transactions.month, lastMonth)))
    .groupBy(transactions.month)
    .orderBy(asc(transactions.month));
}

/** Income, expense and transaction count for the whole range in one pass. */
export function totalsQuery(db: AnalyticsDb, firstMonth: string, lastMonth: string) {
  return db
    .select({
      incomePaise: income,
      expensePaise: expense,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(live, gte(transactions.month, firstMonth), lte(transactions.month, lastMonth)));
}

/**
 * The ledger's first transaction date at or before `lastMonth`, or null when
 * there is none. One step down tx_ledger_idx (date, partial on
 * deleted_at IS NULL) — never a scan.
 *
 * Bounded like every other builder here: this date is the denominator of
 * "average per day", so a future-dated row must not stretch the window.
 */
export function earliestDateQuery(db: AnalyticsDb, lastMonth: string) {
  return db
    .select({ date: sql<string | null>`min(${transactions.date})` })
    .from(transactions)
    .where(and(live, lte(transactions.month, lastMonth)));
}

/**
 * The single largest expense in the range, with its category.
 *
 * Uses SQLite's bare-column rule: in a query with a single max(), the other
 * columns come from the row that holds the maximum. That finds the row in one
 * pass with no sort step, where ORDER BY amount DESC LIMIT 1 would ask for a
 * temporary B-tree. On an empty range it returns one row of NULLs.
 */
export function biggestExpenseQuery(db: AnalyticsDb, firstMonth: string, lastMonth: string) {
  return db
    .select({
      amountPaise: sql<number | null>`max(${transactions.amountPaise})`,
      id: transactions.id,
      date: transactions.date,
      note: transactions.note,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        live,
        eq(transactions.type, 'expense'),
        gte(transactions.month, firstMonth),
        lte(transactions.month, lastMonth),
      ),
    );
}

/**
 * Expense per category between two months inclusive, largest first.
 * Uncategorised spend is its own row with a NULL id. The number of groups is
 * bounded by the number of categories, so the GROUP BY / ORDER BY sort
 * handles a few dozen rows however large the ledger grows.
 */
export function categoryTotalsQuery(db: AnalyticsDb, fromMonth: string, toMonth: string, limit?: number) {
  const total = sql<number>`sum(${transactions.amountPaise})`;
  const q = db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
      totalPaise: total,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(live, eq(transactions.type, 'expense'), gte(transactions.month, fromMonth), lte(transactions.month, toMonth)),
    )
    .groupBy(transactions.categoryId)
    .orderBy(desc(total), asc(categories.name));
  return limit == null ? q : q.limit(limit);
}
