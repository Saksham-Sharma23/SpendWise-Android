import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { categories, transactions } from '@/db/schema';
import type { AnyDb } from '@/db/types';

/**
 * Ledger aggregates that more than one feature shows — each written ONCE (R3-4).
 *
 * Home, Insights, the ledger summary and Budgets each had their own copy of
 * these, and two copies of "this month's expenses" had already drifted apart:
 * one bounded the month at both ends, one did not (B1, B2). One definition
 * cannot disagree with itself.
 *
 * Every builder takes `db`, so data/__tests__ runs the shipped SQL on
 * better-sqlite3 (CLAUDE.md #18), and every range is bounded at BOTH ends (#5).
 * Month ranges filter the generated `month` column and repeat
 * `deleted_at IS NULL`, which is what lets SQLite use the partial
 * tx_month_idx instead of scanning.
 */

const live = isNull(transactions.deletedAt);

/** Income summed in SQL; 0 rather than NULL over no rows. */
export const incomeSum = sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`;

/** Expense summed in SQL; 0 rather than NULL over no rows. */
export const expenseSum = sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`;

/** Income and expense per month, `fromMonth`..`toMonth` ('YYYY-MM') inclusive, oldest first. Empty months are absent. */
export function monthTrend(db: AnyDb, fromMonth: string, toMonth: string) {
  return db
    .select({ month: sql<string>`${transactions.month}`, incomePaise: incomeSum, expensePaise: expenseSum })
    .from(transactions)
    .where(and(live, gte(transactions.month, fromMonth), lte(transactions.month, toMonth)))
    .groupBy(transactions.month)
    .orderBy(asc(transactions.month));
}

/** Income, expense and row count over `fromMonth`..`toMonth` inclusive, in one pass. */
export function incomeExpenseTotals(db: AnyDb, fromMonth: string, toMonth: string) {
  return db
    .select({ incomePaise: incomeSum, expensePaise: expenseSum, count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(live, gte(transactions.month, fromMonth), lte(transactions.month, toMonth)));
}

/**
 * Expense per category over `fromMonth`..`toMonth` inclusive, largest first.
 * Uncategorised spend is its own row with a NULL id. The groups are bounded by
 * the number of categories, so the sort handles a few dozen rows however large
 * the ledger grows.
 */
export function categoryTotals(db: AnyDb, fromMonth: string, toMonth: string, limit?: number) {
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

/** One budget's cycle: the category it covers and its window, both dates INCLUSIVE. */
export interface SpendWindow {
  categoryId: number;
  start: string;
  end: string;
}

/**
 * Expense per category, each counted only inside its OWN window.
 *
 * Budgets reset on different days, so no single `WHERE date BETWEEN ? AND ?`
 * serves them all; each category contributes a clause that only matches rows
 * inside its own window. One pass, one row per category. Home's budget card,
 * the Budgets screen and (Phase 8) the 75%/100% alerts all use THIS, so the
 * bar and the alert cannot disagree.
 */
export function budgetSpend(db: AnyDb, windows: readonly SpendWindow[]) {
  const inWindow = sql.join(
    windows.map(
      (w) =>
        sql`(${transactions.categoryId} = ${w.categoryId} and ${transactions.date} >= ${w.start} and ${transactions.date} <= ${w.end})`,
    ),
    sql` or `,
  );
  return db
    .select({
      categoryId: sql<number>`${transactions.categoryId}`,
      spentPaise: sql<number>`coalesce(sum(${transactions.amountPaise}), 0)`,
    })
    .from(transactions)
    .where(and(live, eq(transactions.type, 'expense'), windows.length > 0 ? sql`(${inWindow})` : sql`0`))
    .groupBy(transactions.categoryId);
}

export interface MonthPoint {
  /** 'YYYY-MM' */
  month: string;
  incomePaise: number;
  expensePaise: number;
}

/**
 * One point per month in `months`, in that order, zero where SQL returned none.
 *
 * SQLite returns only months that HAVE rows. A chart that silently skipped an
 * empty month would misrepresent the trend, so the gaps are filled — and a row
 * for a month NOT in `months` is dropped rather than drawn.
 */
export function fillMonths(rows: readonly MonthPoint[], months: readonly string[]): MonthPoint[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((month) => ({
    month,
    incomePaise: byMonth.get(month)?.incomePaise ?? 0,
    expensePaise: byMonth.get(month)?.expensePaise ?? 0,
  }));
}
