import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';

import { categoryTotals, monthTrend } from '@/data/ledger/sql';
import { budgets, categories, subscriptions, transactions } from '@/db/schema';
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

/**
 * This month and last month side by side in ONE query: one range scan on
 * tx_ledger_idx, split into sums by CASE. Last month is also cut at the same
 * day of the month as today, so the 10th compares ten days with ten days.
 */
export function overviewQuery(db: AnyDb, today: ISODate) {
  const thisStart = startOfMonth(today);
  const lastStart = addMonthsClamped(thisStart, -1);
  const nextStart = addMonthsClamped(thisStart, 1);
  const lastToDate = addMonthsClamped(today, -1);
  const inThis = sql`${transactions.date} >= ${thisStart}`;
  return db
    .select({
      incomePaise: sql<number>`coalesce(sum(case when ${inThis} and ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`,
      expensePaise: sql<number>`coalesce(sum(case when ${inThis} and ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
      lastIncomePaise: sql<number>`coalesce(sum(case when not (${inThis}) and ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`,
      lastExpensePaise: sql<number>`coalesce(sum(case when not (${inThis}) and ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
      lastExpenseToDatePaise: sql<number>`coalesce(sum(case when not (${inThis}) and ${transactions.date} <= ${lastToDate} and ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
      count: sql<number>`coalesce(sum(case when ${inThis} then 1 else 0 end), 0)`,
    })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), gte(transactions.date, lastStart), lt(transactions.date, nextStart)));
}

/** The newest `limit` live transactions with their category's look. */
export function recentQuery(db: AnyDb, limit: number) {
  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      amountPaise: transactions.amountPaise,
      date: transactions.date,
      note: transactions.note,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(isNull(transactions.deletedAt))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit);
}

/** Live ACTIVE subscriptions with their category's look, for the renewals card. */
export function activeSubscriptionsQuery(db: AnyDb) {
  return db
    .select({
      id: subscriptions.id,
      name: subscriptions.name,
      amountPaise: subscriptions.amountPaise,
      billingCycle: subscriptions.billingCycle,
      status: subscriptions.status,
      anchorDate: subscriptions.anchorDate,
      reminderDaysBefore: subscriptions.reminderDaysBefore,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(subscriptions)
    .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
    .where(and(isNull(subscriptions.deletedAt), eq(subscriptions.status, 'active')))
    .orderBy(asc(subscriptions.name));
}

/** One indexed probe for "is there any live transaction at all" — never a count. */
export function anyTransactionQuery(db: AnyDb) {
  return db.select({ id: transactions.id }).from(transactions).where(isNull(transactions.deletedAt)).limit(1);
}

/** Live budgets on live categories, for Home's card. Spend comes from data/ledger. */
export function homeBudgetsQuery(db: AnyDb) {
  return db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      limitPaise: budgets.limitPaise,
      resetDay: budgets.resetDay,
      isActive: budgets.isActive,
      categoryName: categories.name,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(isNull(budgets.deletedAt), isNull(categories.deletedAt)));
}
