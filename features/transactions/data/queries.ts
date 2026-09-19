import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { useIsFocused } from 'expo-router';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { db } from '@/db/client';
import { readDb } from '@/db/read';
import { safeWrite, type WriteResult } from '@/lib/db/safeWrite';
import { useDbQuery } from '@/lib/db/useDbQuery';
import { categories, transactions } from '@/db/schema';
import type { TransactionType } from '@/db/schema';
import { makeDedupeHash } from '@/lib/dedupe';
import { nowISO, type ISODate } from '@/lib/dates';
import { useToday } from '@/lib/today';
import { atOrNewerThan, buildWhere, olderThan, type LedgerKey, type TransactionFilters } from './filters';
import { idsNotInPages, keyOf, stalePages, type OlderPage } from '../domain/pages';

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

export { EMPTY_FILTERS, buildWhere, currentMonthFilters, hasActiveFilters, type TransactionFilters } from './filters';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const listColumns = {
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

export const LEDGER_PAGE = 40;

/**
 * How many changed ids are worth looking keys up for in one go.
 *
 * SQLite's bound-parameter limit is 999 on older builds, so this stays well
 * below it. Past this many, `stalePages` refreshes every loaded page instead
 * (B12) — a bulk change is rare, and a ledger showing rows that no longer
 * exist is not an acceptable alternative.
 */
export const KEY_LOOKUP_LIMIT = 400;

const EMPTY_ROWS: TransactionRow[] = [];

export interface TransactionPages {
  rows: TransactionRow[];
  status: 'pending' | 'ok' | 'error';
  /** Load the next older page. Safe to call repeatedly (onEndReached). */
  loadMore: () => void;
  /** Collapse back to the live first page (pull-to-refresh). */
  reset: () => void;
  /**
   * Collapse to page 1 AND re-run it. What "Try again" and pull-to-refresh
   * need: `reset` alone only drops the older pages, and when none are loaded
   * it changes nothing the live query depends on, so nothing re-runs (B7).
   */
  retry: () => void;
  hasMore: boolean;
}

/**
 * The ledger, paged by KEYSET (decision F0-S4, CLAUDE.md navigation).
 *
 * Page 1 is live through useDbQuery. Until an older page exists it is the
 * newest LEDGER_PAGE rows; once one does, it becomes "every row at or newer
 * than the first boundary", so a row added at the top grows page 1 instead of
 * pushing a row into a gap. Older pages are fetched once with
 * `(date, id) < (lastDate, lastId)` and refetched only when a change touches
 * them (see ./pages.ts): scrolling 2,000 rows deep and adding a transaction
 * re-sends page 1, not the whole window.
 */
export function useTransactionPages(filters: TransactionFilters): TransactionPages {
  // A date preset ("Last 7 days") is stored as a NAME and resolved against
  // today inside buildWhere, so the window has to be re-read when the date
  // rolls over — otherwise a ledger left open overnight keeps yesterday's
  // window and a transaction added after midnight is missing from it.
  const today = useToday();
  const filterKey = `${JSON.stringify(filters)}|${today}`;
  const [older, setOlder] = useState<OlderPage<TransactionRow>[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loading = useRef(false);
  // Bumped on every filter change or reset, so a slow page answering for an
  // old filter can never be appended to the new list.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    loading.current = false;
    setOlder([]);
    setHasMore(true);
  }, [filterKey]);

  const boundary = older[0]?.upper ?? null;
  const live = useDbQuery(
    async () =>
      (await (boundary
        ? transactionQueries.atOrNewer(filters, boundary)
        : transactionQueries.ledger(filters, LEDGER_PAGE))) as TransactionRow[],
    // categories too: a rename must refresh the names shown on every row.
    ['transactions', 'categories'],
    [filterKey, boundary?.date, boundary?.id],
    EMPTY_ROWS,
  );

  const olderRef = useRef(older);
  olderRef.current = older;
  const liveRef = useRef(live.data);
  liveRef.current = live.data;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadMore = useCallback(() => {
    if (loading.current || !hasMore || live.status !== 'ok') return;
    const pages = olderRef.current;
    if (pages.length === 0 && liveRef.current.length < LEDGER_PAGE) {
      // Page 1 is not even full: nothing older exists.
      setHasMore(false);
      return;
    }
    const tail = pages.length > 0 ? pages[pages.length - 1]!.lower : liveRef.current.at(-1);
    if (!tail) {
      setHasMore(false);
      return;
    }
    const upper = keyOf(tail);
    loading.current = true;
    const gen = generation.current;
    void (transactionQueries.olderThan(filtersRef.current, upper, LEDGER_PAGE) as Promise<TransactionRow[]>).then(
      (rows) => {
        loading.current = false;
        if (gen !== generation.current) return;
        if (rows.length < LEDGER_PAGE) setHasMore(false);
        if (rows.length === 0) return;
        setOlder((prev) => [...prev, { upper, lower: keyOf(rows[rows.length - 1]!), rows }]);
      },
      () => {
        loading.current = false;
      },
    );
  }, [hasMore, live.status]);

  const reset = useCallback(() => {
    generation.current += 1;
    loading.current = false;
    setOlder([]);
    setHasMore(true);
  }, []);

  // Targeted refresh of OLDER pages. Page 1 refreshes itself via useDbQuery;
  // here changed row ids are collected for a moment, mapped to the older
  // pages they touch, and only those pages are refetched. Deferred while the
  // tab is unfocused, then applied once on focus.
  const isFocused = useIsFocused();
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;
  const pendingTx = useRef(new Set<number>());
  const pendingCat = useRef(new Set<number>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    flushTimer.current = null;
    if (!focusedRef.current) return;
    const pages = olderRef.current;
    const txIds = new Set(pendingTx.current);
    const categoryIds = new Set(pendingCat.current);
    pendingTx.current.clear();
    pendingCat.current.clear();
    if (pages.length === 0 || (txIds.size === 0 && categoryIds.size === 0)) return;

    const gen = generation.current;
    const unknown = idsNotInPages(pages, txIds);
    // Past the limit the keys are not worth fetching: every loaded page is
    // refreshed instead (B12). Bulk changes are rare; a wrong ledger is not.
    const overflowed = unknown.length > KEY_LOOKUP_LIMIT;
    const unknownKeys = !overflowed && unknown.length > 0 ? await transactionQueries.keysFor(unknown) : [];
    if (gen !== generation.current) return;

    const { pages: stale, belowLoaded } = stalePages(pages, { txIds, categoryIds, unknownKeys, overflowed });
    if (belowLoaded) setHasMore(true);
    if (stale.size === 0) return;

    const refreshed = await Promise.all(
      [...stale].map(async (i) => {
        const p = pages[i]!;
        const rows = (await transactionQueries.between(filtersRef.current, p.upper, p.lower)) as TransactionRow[];
        return [i, rows] as const;
      }),
    );
    if (gen !== generation.current) return;
    setOlder((prev) => {
      const next = prev.slice();
      for (const [i, rows] of refreshed) {
        const page = next[i];
        if (page) next[i] = { ...page, rows };
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const sub = addDatabaseChangeListener((event) => {
      if (event.tableName === 'transactions') pendingTx.current.add(event.rowId);
      else if (event.tableName === 'categories') pendingCat.current.add(event.rowId);
      else return;
      if (!flushTimer.current) flushTimer.current = setTimeout(() => void flush(), 32);
    });
    return () => {
      sub.remove();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = null;
    };
  }, [flush]);

  useEffect(() => {
    if (isFocused && (pendingTx.current.size > 0 || pendingCat.current.size > 0)) void flush();
  }, [isFocused, flush]);

  const rows = useMemo(
    () => (older.length === 0 ? live.data : live.data.concat(...older.map((p) => p.rows))),
    [live.data, older],
  );

  // Held in a ref so `retry` keeps a stable identity: it is passed to the
  // ledger's error state and to pull-to-refresh, which should not re-render
  // on every result.
  const refetchRef = useRef(live.refetch);
  refetchRef.current = live.refetch;

  const retry = useCallback(() => {
    reset();
    refetchRef.current();
  }, [reset]);

  return { rows, status: live.status, loadMore, reset, retry, hasMore };
}

/**
 * How many rows match, and their totals — in ONE query, computed by SQLite.
 *
 * This is the rule from CLAUDE.md #5 in its most literal form: the ledger may
 * hold 50,000 rows, and this returns exactly one. Counting in JS would mean
 * crossing the bridge with all of them.
 */
export function useTransactionSummary(filters: TransactionFilters) {
  const today = useToday();
  return useDbQuery(
    () => transactionQueries.summary(filters),
    // Search matches category names, so a rename can change the counts.
    ['transactions', 'categories'],
    // `today` re-resolves a rolling date preset at midnight, as above.
    [JSON.stringify(filters), today],
    [],
  );
}

/**
 * A non-live page of matching rows, for export only.
 *
 * Export is the one place the ledger's rows genuinely have to leave SQLite —
 * they are going into a file, not into a sum. Paging keeps a 50k-row export
 * from materialising every row in memory at once.
 */
export function getTransactionsPage(filters: TransactionFilters, limit: number, offset: number): TransactionRow[] {
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

/** Query builders shared by the hooks above and the dev benchmark (db/dev/benchmark.ts). */
export const transactionQueries = {
  /** The newest `limit` rows: page 1 before any older page is loaded. */
  ledger: (filters: TransactionFilters, limit: number) =>
    readDb
      .select(listColumns)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(buildWhere(filters))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit),
  /** Page 1 once older pages exist: every row at or newer than the first boundary. */
  atOrNewer: (filters: TransactionFilters, key: LedgerKey) =>
    readDb
      .select(listColumns)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(buildWhere(filters), atOrNewerThan(key)))
      .orderBy(desc(transactions.date), desc(transactions.id)),
  /** The next older page below `key`. */
  olderThan: (filters: TransactionFilters, key: LedgerKey, limit: number) =>
    readDb
      .select(listColumns)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(buildWhere(filters), olderThan(key)))
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(limit),
  /** An older page's fixed slice: lower <= key < upper. */
  between: (filters: TransactionFilters, upper: LedgerKey, lower: LedgerKey) =>
    readDb
      .select(listColumns)
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(buildWhere(filters), olderThan(upper), atOrNewerThan(lower)))
      .orderBy(desc(transactions.date), desc(transactions.id)),
  /**
   * Current (date, id) keys for changed rows, soft-deleted ones included.
   *
   * The caller must not pass more than KEY_LOOKUP_LIMIT ids: SQLite has a
   * bound-parameter limit, and a list this long means a bulk change, which
   * `stalePages` handles by refreshing everything instead. This used to slice
   * silently at 500 and drop the rest (B12).
   */
  keysFor: (ids: number[]) =>
    readDb
      .select({ date: transactions.date, id: transactions.id })
      .from(transactions)
      .where(inArray(transactions.id, ids)),
  summary: (filters: TransactionFilters) =>
    readDb
      .select({
        count: sql<number>`count(*)`,
        incomePaise: sql<number>`coalesce(sum(case when ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`,
        expensePaise: sql<number>`coalesce(sum(case when ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(buildWhere(filters)),
};

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
}

/**
 * Writes return a WriteResult instead of throwing: on failure the user has
 * already seen a specific toast, and the caller only decides whether to stay
 * open (CLAUDE.md #18).
 */
export function createTransaction(input: TransactionInput): WriteResult<number> {
  return safeWrite('save the transaction', () => {
    const now = nowISO();
    const row = db
      .insert(transactions)
      .values({
        type: input.type,
        amountPaise: input.amountPaise,
        date: input.date,
        note: input.note ?? null,
        categoryId: input.categoryId ?? null,
        // Written on every create so Phase 6's importer can find existing rows
        // by an indexed lookup rather than scanning the table per candidate.
        dedupeHash: makeDedupeHash(input.date, input.amountPaise, input.note),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: transactions.id })
      .all();
    return row[0]!.id;
  });
}

export function updateTransaction(id: number, input: TransactionInput): WriteResult<void> {
  return safeWrite('save the changes', () => {
    db.update(transactions)
      .set({
        type: input.type,
        amountPaise: input.amountPaise,
        date: input.date,
        note: input.note ?? null,
        categoryId: input.categoryId ?? null,
        // Recomputed: the fields it is derived from may all have changed.
        dedupeHash: makeDedupeHash(input.date, input.amountPaise, input.note),
        updatedAt: nowISO(),
      })
      .where(eq(transactions.id, id))
      .run();
  });
}

/**
 * Soft delete. The row stays so the undo toast can put it back, and so a
 * whole import batch can be reversed later.
 */
export function softDeleteTransaction(id: number): WriteResult<void> {
  return safeWrite('delete the transaction', () => {
    db.update(transactions).set({ deletedAt: nowISO() }).where(eq(transactions.id, id)).run();
  });
}

export function softDeleteTransactions(ids: number[]): WriteResult<void> {
  return safeWrite('delete those transactions', () => {
    if (ids.length === 0) return;
    db.update(transactions).set({ deletedAt: nowISO() }).where(inArray(transactions.id, ids)).run();
  });
}

/** A deleted transaction, as Settings → Recently deleted lists it. */
export type DeletedTransactionRow = TransactionRow & { deletedAt: string };

/**
 * Soft-deleted transactions still inside the retention window, newest
 * deletion first. Import-batch rows are left out: they are undone as a batch,
 * never one at a time, and the purge never removes them (db/retention.ts).
 */
export function useDeletedTransactions() {
  return useDbQuery(
    async () =>
      (await readDb
        .select({ ...listColumns, deletedAt: transactions.deletedAt })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(isNotNull(transactions.deletedAt), isNull(transactions.importBatchId)))
        .orderBy(desc(transactions.deletedAt), desc(transactions.id))
        .limit(500)) as DeletedTransactionRow[],
    ['transactions', 'categories'],
    [],
    [] as DeletedTransactionRow[],
  );
}

/**
 * Remove deleted transactions for good, ahead of the purge. The predicate
 * repeats `deleted_at IS NOT NULL`, so this can never remove a live row even
 * if a stale id reaches it.
 */
export function deleteTransactionsForever(ids: number[]): WriteResult<void> {
  return safeWrite('delete permanently', () => {
    if (ids.length === 0) return;
    db.delete(transactions)
      .where(and(inArray(transactions.id, ids), isNotNull(transactions.deletedAt), isNull(transactions.importBatchId)))
      .run();
  });
}

/** Undo a soft delete. Drives the toast action. */
export function restoreTransactions(ids: number[]): WriteResult<void> {
  return safeWrite('restore', () => {
    if (ids.length === 0) return;
    db.update(transactions).set({ deletedAt: null }).where(inArray(transactions.id, ids)).run();
  });
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
