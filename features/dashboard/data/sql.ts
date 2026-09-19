import { and, asc, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm';

import { categories, transactions } from '@/db/schema';
import { addMonthsClamped, startOfMonth, type ISODate } from '@/lib/dates';
import type { AnyDb } from '@/db/types';

/**
 * The dashboard's month-bounded query builders.
 *
 * They live apart from `queries.ts` and import only `db/schema`, so Node can
 * load them: `queries.ts` reaches `db/client` (through `db/seed`) and therefore
 * drags in native expo-sqlite, which Jest cannot require. Builders take the
 * database as a parameter, so the SAME builder runs on the phone through
 * `readDb` and in `__tests__/queries.test.ts` against the real migrated schema
 * (convention #18) — the tests exercise the shipped SQL, not a copy.
 *
 * This is the shape R3 gives every feature (`data/sql.ts`); the dashboard is
 * partly there because B1 could not otherwise be tested.
 *
 * **Both ends of every range are bound** (convention #5). The date picker
 * allows a year ahead, so a future-dated row is ordinary input. Leaving the
 * upper end open (B1) let a row dated next month count in "Where it went" and
 * in the insight banner's share, while the month overview — which did bound by
 * `nextStart` — excluded it. A category's share could read over 100%.
 */

const income = sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`;
const expense = sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`;

/**
 * Income vs expense per month, oldest first, ending at the CURRENT month.
 *
 * Filters and groups on the generated `month` column so SQLite walks
 * tx_month_idx in order with no temporary sort.
 */
export function trendQuery(db: AnyDb, months: number, today: ISODate) {
  const firstKey = addMonthsClamped(startOfMonth(today), -(months - 1)).slice(0, 7);
  const lastKey = today.slice(0, 7);
  return db
    .select({ month: sql<string>`${transactions.month}`, incomePaise: income, expensePaise: expense })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), gte(transactions.month, firstKey), lte(transactions.month, lastKey)))
    .groupBy(transactions.month)
    .orderBy(asc(transactions.month));
}

/** This month's biggest expense categories, bounded by the same `nextStart` the month overview uses. */
export function topCategoriesQuery(db: AnyDb, today: ISODate, limit: number) {
  const total = sql<number>`sum(${transactions.amountPaise})`;
  const thisStart = startOfMonth(today);
  const nextStart = addMonthsClamped(thisStart, 1);
  return db
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
        lt(transactions.date, nextStart),
      ),
    )
    .groupBy(transactions.categoryId)
    .orderBy(desc(total))
    .limit(limit);
}
