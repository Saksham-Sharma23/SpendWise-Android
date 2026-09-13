import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../../db/client';
import { categories, transactions } from '../../db/schema';
import { addMonthsClamped, startOfMonth, type ISODate } from '../../lib/dates';

/**
 * The dashboard's query boundary.
 *
 * Home shows six things at once, and every write re-runs every subscribed
 * query (CLAUDE.md #6) — so each figure here is ONE small aggregate, bounded
 * by a date range on tx_date_idx, never a scan of the ledger.
 */

const income = sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`;
const expense = sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`;

export interface MonthOverview {
  incomePaise: number;
  expensePaise: number;
  lastIncomePaise: number;
  lastExpensePaise: number;
  count: number;
}

/**
 * This month and last month, side by side, in a single query: the CASE
 * expressions split one indexed range into four sums.
 */
export function useMonthOverview(today: ISODate): MonthOverview {
  const thisStart = startOfMonth(today);
  const lastStart = addMonthsClamped(thisStart, -1);
  const nextStart = addMonthsClamped(thisStart, 1);

  const inThis = sql`${transactions.date} >= ${thisStart}`;
  const { data } = useLiveQuery(
    db
      .select({
        incomePaise: sql<number>`coalesce(sum(case when ${inThis} and ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`,
        expensePaise: sql<number>`coalesce(sum(case when ${inThis} and ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
        lastIncomePaise: sql<number>`coalesce(sum(case when not (${inThis}) and ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`,
        lastExpensePaise: sql<number>`coalesce(sum(case when not (${inThis}) and ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
        count: sql<number>`coalesce(sum(case when ${inThis} then 1 else 0 end), 0)`,
      })
      .from(transactions)
      .where(
        and(
          isNull(transactions.deletedAt),
          gte(transactions.date, lastStart),
          lt(transactions.date, nextStart),
        ),
      ),
    [thisStart],
  );

  return (
    data[0] ?? { incomePaise: 0, expensePaise: 0, lastIncomePaise: 0, lastExpensePaise: 0, count: 0 }
  );
}

export interface TrendPoint {
  /** 'YYYY-MM' */
  month: string;
  incomePaise: number;
  expensePaise: number;
}

/**
 * Income vs expense per month for the last `months` months, oldest first.
 *
 * SQLite only returns months that HAVE rows, so the gaps are filled here —
 * a chart that silently skips an empty month misrepresents the trend.
 */
export function useMonthlyTrend(months: number, today: ISODate): TrendPoint[] {
  const firstMonth = addMonthsClamped(startOfMonth(today), -(months - 1));
  const monthExpr = sql<string>`substr(${transactions.date}, 1, 7)`;

  const { data } = useLiveQuery(
    db
      .select({ month: monthExpr, incomePaise: income, expensePaise: expense })
      .from(transactions)
      .where(and(isNull(transactions.deletedAt), gte(transactions.date, firstMonth)))
      .groupBy(monthExpr)
      .orderBy(monthExpr),
    [firstMonth],
  );

  const byMonth = new Map(data.map((r) => [r.month, r]));
  const out: TrendPoint[] = [];
  for (let i = 0; i < months; i++) {
    const key = addMonthsClamped(firstMonth, i).slice(0, 7);
    const row = byMonth.get(key);
    out.push({
      month: key,
      incomePaise: row?.incomePaise ?? 0,
      expensePaise: row?.expensePaise ?? 0,
    });
  }
  return out;
}

export interface CategorySpend {
  id: number | null;
  name: string | null;
  color: string | null;
  icon: string | null;
  totalPaise: number;
}

/** This month's biggest expense categories. */
export function useTopCategories(today: ISODate, limit = 4): CategorySpend[] {
  const thisStart = startOfMonth(today);
  const total = sql<number>`sum(${transactions.amountPaise})`;

  const { data } = useLiveQuery(
    db
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
        and(
          isNull(transactions.deletedAt),
          eq(transactions.type, 'expense'),
          gte(transactions.date, thisStart),
        ),
      )
      .groupBy(transactions.categoryId)
      .orderBy(desc(total))
      .limit(limit),
    [thisStart, limit],
  );

  return data as CategorySpend[];
}

export interface RecentTransaction {
  id: number;
  type: 'expense' | 'income';
  amountPaise: number;
  date: string;
  note: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

export function useRecentTransactions(limit = 5): RecentTransaction[] {
  const { data } = useLiveQuery(
    db
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
      .limit(limit),
    [limit],
  );
  return data as RecentTransaction[];
}
