import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { categories, transactions } from '@/db/schema';
import type { AnyDb } from '@/db/types';

/**
 * The two Analytics builders no other screen needs. The trend, the period
 * totals and the category totals are shared with Home and live in
 * `@/data/ledger` (R3-8) — Insights and Home used to carry separate copies,
 * and those copies had drifted apart (B1, B2).
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

const live = isNull(transactions.deletedAt);

/**
 * The ledger's first transaction date at or before `lastMonth`, or null when
 * there is none. One step down tx_ledger_idx (date, partial on
 * deleted_at IS NULL) — never a scan.
 *
 * Bounded like every other builder here: this date is the denominator of
 * "average per day", so a future-dated row must not stretch the window.
 */
export function earliestDateQuery(db: AnyDb, lastMonth: string) {
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
export function biggestExpenseQuery(db: AnyDb, firstMonth: string, lastMonth: string) {
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
