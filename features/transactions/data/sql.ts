import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { expenseSum, incomeSum } from '@/data/ledger/sql';
import { categories, transactions, type TransactionType } from '@/db/schema';
import type { AnyDb } from '@/db/types';
import { atOrNewerThan, buildWhere, olderThan, type LedgerKey, type TransactionFilters } from './filters';

/**
 * The ledger's read builders. Every one takes `db`, so the SAME SQL runs
 * through the read handle on the phone and on better-sqlite3 in tests
 * (CLAUDE.md #18). Filter construction lives in ./filters.ts.
 *
 * Order is always `date DESC, id DESC`, which tx_ledger_idx serves with no
 * sort: that is what makes keyset paging (`(date, id) < (?, ?)`) a range scan.
 */

export const listColumns = {
  id: transactions.id,
  type: transactions.type,
  amountPaise: transactions.amountPaise,
  date: transactions.date,
  note: transactions.note,
  categoryId: transactions.categoryId,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  categoryColor: categories.color,
};

export type TransactionRow = {
  id: number;
  type: TransactionType;
  amountPaise: number;
  date: string;
  note: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
};

/** A deleted transaction, as Settings → Recently deleted lists it. */
export type DeletedTransactionRow = TransactionRow & { deletedAt: string };

const newestFirst = [desc(transactions.date), desc(transactions.id)] as const;

function rows(db: AnyDb) {
  return db.select(listColumns).from(transactions).leftJoin(categories, eq(transactions.categoryId, categories.id));
}

/** The newest `limit` rows: page 1 before any older page is loaded. */
export function ledgerQuery(db: AnyDb, filters: TransactionFilters, limit: number) {
  return rows(db)
    .where(buildWhere(filters))
    .orderBy(...newestFirst)
    .limit(limit);
}

/** Page 1 once older pages exist: every row at or newer than the first boundary. */
export function atOrNewerQuery(db: AnyDb, filters: TransactionFilters, key: LedgerKey) {
  return rows(db)
    .where(and(buildWhere(filters), atOrNewerThan(key)))
    .orderBy(...newestFirst);
}

/** The next `limit` rows strictly older than `key`. Also the export's page. */
export function olderThanQuery(db: AnyDb, filters: TransactionFilters, key: LedgerKey, limit: number) {
  return rows(db)
    .where(and(buildWhere(filters), olderThan(key)))
    .orderBy(...newestFirst)
    .limit(limit);
}

/** An older page's fixed slice: lower <= key < upper. */
export function betweenQuery(db: AnyDb, filters: TransactionFilters, upper: LedgerKey, lower: LedgerKey) {
  return rows(db)
    .where(and(buildWhere(filters), olderThan(upper), atOrNewerThan(lower)))
    .orderBy(...newestFirst);
}

/**
 * Current (date, id) keys for changed rows, soft-deleted ones included.
 *
 * Callers pass at most KEY_LOOKUP_LIMIT ids: past that it is a bulk change,
 * which `stalePages` handles by refreshing everything. This used to slice
 * silently at 500 and drop the rest (B12).
 */
export function keysForQuery(db: AnyDb, ids: number[]) {
  return db
    .select({ date: transactions.date, id: transactions.id })
    .from(transactions)
    .where(inArray(transactions.id, ids));
}

/**
 * How many rows match, and their totals — ONE row, computed by SQLite, over
 * a ledger that may hold 50,000 (CLAUDE.md #5). The sums are the shared
 * fragments from data/ledger, the same ones Home and Insights use.
 */
export function summaryQuery(db: AnyDb, filters: TransactionFilters) {
  return db
    .select({ count: sql<number>`count(*)`, incomePaise: incomeSum, expensePaise: expenseSum })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildWhere(filters));
}

/** One live transaction, for the edit form. */
export function transactionQuery(db: AnyDb, id: number) {
  return rows(db)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .limit(1);
}

/**
 * Soft-deleted transactions, newest deletion first. Import-batch rows are left
 * out: they are undone as a batch, never one at a time, and the purge never
 * removes them (db/retention.ts).
 */
export function deletedTransactionsQuery(db: AnyDb, limit = 500) {
  return db
    .select({ ...listColumns, deletedAt: transactions.deletedAt })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(isNotNull(transactions.deletedAt), isNull(transactions.importBatchId)))
    .orderBy(desc(transactions.deletedAt), desc(transactions.id))
    .limit(limit);
}

/** Which of these dedupe hashes already exist among live rows. One chunk; see writes.existingHashes. */
export function existingHashesQuery(db: AnyDb, hashes: string[]) {
  return db
    .select({ hash: transactions.dedupeHash })
    .from(transactions)
    .where(and(inArray(transactions.dedupeHash, hashes), isNull(transactions.deletedAt)));
}
