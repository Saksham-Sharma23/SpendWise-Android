import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../../db/client';
import { categories, transactions } from '../../db/schema';
import type { TransactionType } from '../../db/schema';
import { makeDedupeHash } from '../../lib/dedupe';
import type { ISODate } from '../../lib/dates';
import { buildWhere, type TransactionFilters } from './filters';

/**
 * The transactions query boundary.
 *
 * Every screen reads and writes the ledger through this file and never sees a
 * table name (CLAUDE.md #4). With no API, this is the boundary the backend
 * used to give us for free — and the one thing keeping SQL out of components.
 *
 * Two rules shape everything here:
 *   - Aggregates are computed in SQL, never by pulling rows into JS (#5).
 *   - Reads filter `deletedAt IS NULL`; deletes are soft, so undo works (#13).
 *
 * Filter construction lives in ./filters.ts, which has no database handle so
 * it stays testable in Node.
 */

export {
  EMPTY_FILTERS,
  buildWhere,
  currentMonthFilters,
  hasActiveFilters,
  type TransactionFilters,
} from './filters';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const listColumns = {
  id: transactions.id,
  type: transactions.type,
  amountPaise: transactions.amountPaise,
  date: transactions.date,
  note: transactions.note,
  isRecurring: transactions.isRecurring,
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
  isRecurring: boolean;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
};

/**
 * A live, windowed page of the ledger.
 *
 * `limit` is a window, not a page number: the caller grows it as the user
 * scrolls. That keeps infinite scroll compatible with `useLiveQuery`, which
 * re-runs the whole query on any write — with OFFSET paging, a row inserted
 * at the top would shift every later page by one and duplicate a row on screen.
 *
 * Ordered by date then id so the order is total and stable; two transactions
 * on the same day would otherwise be free to swap places between renders.
 */
export function useTransactions(filters: TransactionFilters, limit: number) {
  return useLiveQuery(
    db
      .select(listColumns)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(buildWhere(filters))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit),
    [JSON.stringify(filters), limit],
  );
}

/**
 * How many rows match, and their totals — in ONE query, computed by SQLite.
 *
 * This is the rule from CLAUDE.md #5 in its most literal form: the ledger may
 * hold 50,000 rows, and this returns exactly one. Counting in JS would mean
 * crossing the bridge with all of them.
 */
export function useTransactionSummary(filters: TransactionFilters) {
  return useLiveQuery(
    db
      .select({
        count: sql<number>`count(*)`,
        incomePaise: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`,
        expensePaise: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(buildWhere(filters)),
    [JSON.stringify(filters)],
  );
}

/**
 * A non-live page of matching rows, for export only.
 *
 * Export is the one place the ledger's rows genuinely have to leave SQLite —
 * they are going into a file, not into a sum. Paging keeps a 50k-row export
 * from materialising every row in memory at once.
 */
export function getTransactionsPage(
  filters: TransactionFilters,
  limit: number,
  offset: number,
): TransactionRow[] {
  return db
    .select(listColumns)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildWhere(filters))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit)
    .offset(offset)
    .all() as TransactionRow[];
}

/** One transaction by id, for the edit form. */
export function getTransaction(id: number): TransactionRow | undefined {
  const rows = db
    .select(listColumns)
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .limit(1)
    .all();
  return rows[0] as TransactionRow | undefined;
}

/** All live categories, for pickers and the filter sheet. */
export function useCategories() {
  return useLiveQuery(
    db
      .select()
      .from(categories)
      .where(isNull(categories.deletedAt))
      .orderBy(categories.name),
  );
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface TransactionInput {
  type: TransactionType;
  /** Integer paise. The form converts before calling — never a float here. */
  amountPaise: number;
  date: ISODate;
  note?: string | null;
  categoryId?: number | null;
  isRecurring?: boolean;
}

export function createTransaction(input: TransactionInput): number {
  const now = new Date().toISOString();
  const row = db
    .insert(transactions)
    .values({
      type: input.type,
      amountPaise: input.amountPaise,
      date: input.date,
      note: input.note ?? null,
      categoryId: input.categoryId ?? null,
      isRecurring: input.isRecurring ?? false,
      // Written on every create so Phase 6's importer can find existing rows
      // by an indexed lookup rather than scanning the table per candidate.
      dedupeHash: makeDedupeHash(input.date, input.amountPaise, input.note),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: transactions.id })
    .all();
  return row[0]!.id;
}

export function updateTransaction(id: number, input: TransactionInput): void {
  db.update(transactions)
    .set({
      type: input.type,
      amountPaise: input.amountPaise,
      date: input.date,
      note: input.note ?? null,
      categoryId: input.categoryId ?? null,
      isRecurring: input.isRecurring ?? false,
      // Recomputed: the fields it is derived from may all have changed.
      dedupeHash: makeDedupeHash(input.date, input.amountPaise, input.note),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(transactions.id, id))
    .run();
}

/**
 * Soft delete. The row stays so the undo toast can put it back, and so a
 * whole import batch can be reversed later.
 */
export function softDeleteTransaction(id: number): void {
  db.update(transactions)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(transactions.id, id))
    .run();
}

export function softDeleteTransactions(ids: number[]): void {
  if (ids.length === 0) return;
  db.update(transactions)
    .set({ deletedAt: new Date().toISOString() })
    .where(inArray(transactions.id, ids))
    .run();
}

/** Undo a soft delete. Drives the toast action. */
export function restoreTransactions(ids: number[]): void {
  if (ids.length === 0) return;
  db.update(transactions)
    .set({ deletedAt: null })
    .where(inArray(transactions.id, ids))
    .run();
}

// ---------------------------------------------------------------------------
// Helpers shared with later phases
// ---------------------------------------------------------------------------

/**
 * Which of these dedupe hashes already exist in the live ledger.
 *
 * One indexed query for the whole candidate set, rather than one query per
 * row. Phase 6 calls this with a few thousand hashes at once.
 */
export function findExistingHashes(hashes: string[]): Set<string> {
  if (hashes.length === 0) return new Set();
  const found = new Set<string>();
  // SQLite caps host parameters (999 by default), so chunk rather than
  // assuming the whole set fits in one IN clause.
  const CHUNK = 500;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const slice = hashes.slice(i, i + CHUNK);
    const rows = db
      .select({ hash: transactions.dedupeHash })
      .from(transactions)
      .where(and(inArray(transactions.dedupeHash, slice), isNull(transactions.deletedAt)))
      .all();
    for (const r of rows) if (r.hash) found.add(r.hash);
  }
  return found;
}
