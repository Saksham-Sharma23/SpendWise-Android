import { and, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';

import { categories, transactions } from '../../db/schema';
import type { TransactionType } from '../../db/schema';
import { todayISO, type ISODate } from '../../lib/dates';

/**
 * Filter construction for the ledger — deliberately kept free of any database
 * handle.
 *
 * This file imports schema columns and drizzle's expression builders, and
 * nothing else. `queries.ts` is where the expo-sqlite handle lives, and
 * importing that in Node drags in an ESM native module Jest cannot load.
 * Splitting them means the filter semantics — LIKE escaping above all — can
 * be proven against better-sqlite3 in CI with no device and no emulator.
 */

export interface TransactionFilters {
  /** 'all' means no type predicate at all, not `type IN ('expense','income')`. */
  type?: TransactionType | 'all';
  categoryIds?: number[];
  dateFrom?: ISODate;
  dateTo?: ISODate;
  /** Matched against the note and the category name. */
  search?: string;
}

export const EMPTY_FILTERS: TransactionFilters = { type: 'all' };

/** True when the filters would narrow anything — drives the "clear" affordance. */
export function hasActiveFilters(f: TransactionFilters): boolean {
  return Boolean(
    (f.type && f.type !== 'all') ||
      (f.categoryIds && f.categoryIds.length > 0) ||
      f.dateFrom ||
      f.dateTo ||
      (f.search && f.search.trim().length > 0),
  );
}

/**
 * Escape LIKE wildcards in user input.
 *
 * Without this, typing '%' matches every row and '_' matches any single
 * character. The user reads that as "search is broken" rather than as a
 * query bug, so it is worth the paired ESCAPE clause below.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Build the shared WHERE for every read. Returns undefined when unfiltered. */
export function buildWhere(f: TransactionFilters): SQL | undefined {
  const clauses: (SQL | undefined)[] = [isNull(transactions.deletedAt)];

  if (f.type && f.type !== 'all') {
    clauses.push(eq(transactions.type, f.type));
  }
  if (f.categoryIds && f.categoryIds.length > 0) {
    clauses.push(inArray(transactions.categoryId, f.categoryIds));
  }
  if (f.dateFrom) clauses.push(gte(transactions.date, f.dateFrom));
  if (f.dateTo) clauses.push(lte(transactions.date, f.dateTo));

  const q = f.search?.trim();
  if (q) {
    const pattern = `%${escapeLike(q.toLowerCase())}%`;
    clauses.push(
      or(
        sql`lower(${transactions.note}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${categories.name}) LIKE ${pattern} ESCAPE '\\'`,
      ),
    );
  }

  return and(...clauses.filter(Boolean));
}

/** Default window: the current month, used for the ledger's first paint. */
export function currentMonthFilters(): TransactionFilters {
  const today = todayISO();
  return { ...EMPTY_FILTERS, dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
}

// ---------------------------------------------------------------------------
// Keyset bounds — the ledger's paging (see ./pages.ts)
// ---------------------------------------------------------------------------

export interface LedgerKey {
  date: string;
  id: number;
}

/**
 * Rows strictly OLDER than `key` in `date DESC, id DESC` order.
 *
 * Written as a row-value comparison so SQLite can walk the ledger index from
 * the key downwards: the index on `date` carries the rowid, which is `id`, so
 * `(date, id) < (?, ?)` is a range scan with no sort — unlike OFFSET, whose
 * cost grows with every page scrolled.
 */
export function olderThan(key: LedgerKey): SQL {
  return sql`(${transactions.date}, ${transactions.id}) < (${key.date}, ${key.id})`;
}

/** Rows at or NEWER than `key` — the live page once older pages are loaded. */
export function atOrNewerThan(key: LedgerKey): SQL {
  return sql`(${transactions.date}, ${transactions.id}) >= (${key.date}, ${key.id})`;
}
