import { and, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';

import { categories, transactions } from '@/db/schema';
import type { TransactionType } from '@/db/schema';
import { addDays, startOfMonth, todayISO, type ISODate } from '@/lib/dates';

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

/**
 * A rolling window, stored as a NAME and resolved against today at query time.
 *
 * Storing "Last 7 days" as the two dates it meant when it was tapped is the
 * bug this replaces (TASKS2 [U2]): the filter was set at 23:50 with
 * `dateTo = yesterday's date`, so anything added after midnight fell outside
 * its own filter and the ledger looked like it had lost the transaction.
 */
export type DatePreset = 'last7' | 'last30' | 'thisMonth' | 'last12m';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'last12m', label: 'Last 12 months' },
];

export interface TransactionFilters {
  /** 'all' means no type predicate at all, not `type IN ('expense','income')`. */
  type?: TransactionType | 'all';
  categoryIds?: number[];
  /** A rolling window. Takes precedence over `dateFrom`/`dateTo`. */
  datePreset?: DatePreset;
  /** An explicit range, for "March 2025" and anything else a preset can't say. */
  dateFrom?: ISODate;
  dateTo?: ISODate;
  /** Matched against the note and the category name. */
  search?: string;
}

export const EMPTY_FILTERS: TransactionFilters = { type: 'all' };

/** The concrete bounds a filter means today. */
export interface DateRange {
  from?: ISODate;
  to?: ISODate;
}

export function resolveDateRange(f: TransactionFilters, today: ISODate = todayISO()): DateRange {
  switch (f.datePreset) {
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisMonth':
      return { from: startOfMonth(today), to: today };
    case 'last12m':
      return { from: addDays(today, -364), to: today };
    default:
      return { from: f.dateFrom, to: f.dateTo };
  }
}

/** True when the filters would narrow anything — drives the "clear" affordance. */
export function hasActiveFilters(f: TransactionFilters): boolean {
  return Boolean(
    (f.type && f.type !== 'all') ||
    (f.categoryIds && f.categoryIds.length > 0) ||
    f.datePreset ||
    f.dateFrom ||
    f.dateTo ||
    (f.search && f.search.trim().length > 0),
  );
}

/** Clearing the date filter has to clear both shapes it can take. */
export const NO_DATES: Pick<TransactionFilters, 'datePreset' | 'dateFrom' | 'dateTo'> = {
  datePreset: undefined,
  dateFrom: undefined,
  dateTo: undefined,
};

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

/**
 * Build the shared WHERE for every read. Returns undefined when unfiltered.
 *
 * `today` is resolved here rather than stored in the filters, so a preset
 * means the same thing the moment the query runs. Callers inside React pass
 * `useToday()` and list it in their deps, which is what re-runs the query when
 * the date rolls over with the app open.
 */
export function buildWhere(f: TransactionFilters, today: ISODate = todayISO()): SQL | undefined {
  const clauses: (SQL | undefined)[] = [isNull(transactions.deletedAt)];

  if (f.type && f.type !== 'all') {
    clauses.push(eq(transactions.type, f.type));
  }
  if (f.categoryIds && f.categoryIds.length > 0) {
    clauses.push(inArray(transactions.categoryId, f.categoryIds));
  }
  const { from, to } = resolveDateRange(f, today);
  if (from) clauses.push(gte(transactions.date, from));
  if (to) clauses.push(lte(transactions.date, to));

  // No lower() (R5-3): SQLite's LIKE already ignores ASCII case, and lower()
  // cost a function call per row per column. Neither folds non-ASCII case
  // (SQLite has no ICU here), so the pattern goes in as typed: 'É' finds 'É'.
  // It used to be lowered in JS only, so 'É' searched for 'é' and missed.
  const q = f.search?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    clauses.push(
      or(sql`${transactions.note} LIKE ${pattern} ESCAPE '\\'`, sql`${categories.name} LIKE ${pattern} ESCAPE '\\'`),
    );
  }

  return and(...clauses.filter(Boolean));
}

/** Default window: the current month, used for the ledger's first paint. */
export function currentMonthFilters(): TransactionFilters {
  return { ...EMPTY_FILTERS, datePreset: 'thisMonth' };
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
