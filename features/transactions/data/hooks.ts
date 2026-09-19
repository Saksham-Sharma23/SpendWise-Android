import { useIsFocused } from 'expo-router';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { readDb } from '@/db/read';
import { useDbQuery } from '@/lib/db/useDbQuery';
import { useToday } from '@/lib/today';
import { idsNotInPages, keyOf, stalePages, type OlderPage } from '../domain/pages';
import type { LedgerKey, TransactionFilters } from './filters';
import {
  atOrNewerQuery,
  betweenQuery,
  deletedTransactionsQuery,
  keysForQuery,
  ledgerQuery,
  olderThanQuery,
  summaryQuery,
  type DeletedTransactionRow,
  type TransactionRow,
} from './sql';

/**
 * The ledger's live reads. Screens call these and never see a table name
 * (CLAUDE.md #4); the SQL is in ./sql.ts, where tests run it.
 */

/** The builders bound to the read handle: used by the hooks below and the dev benchmark. */
export const transactionQueries = {
  ledger: (filters: TransactionFilters, limit: number) => ledgerQuery(readDb, filters, limit),
  atOrNewer: (filters: TransactionFilters, key: LedgerKey) => atOrNewerQuery(readDb, filters, key),
  olderThan: (filters: TransactionFilters, key: LedgerKey, limit: number) =>
    olderThanQuery(readDb, filters, key, limit),
  between: (filters: TransactionFilters, upper: LedgerKey, lower: LedgerKey) =>
    betweenQuery(readDb, filters, upper, lower),
  keysFor: (ids: number[]) => keysForQuery(readDb, ids),
  summary: (filters: TransactionFilters) => summaryQuery(readDb, filters),
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

const EMPTY_DELETED: DeletedTransactionRow[] = [];

/** Soft-deleted transactions still inside the retention window, for Settings → Recently deleted. */
export function useDeletedTransactions() {
  return useDbQuery(
    async () => (await deletedTransactionsQuery(readDb)) as DeletedTransactionRow[],
    ['transactions', 'categories'],
    [],
    EMPTY_DELETED,
  );
}
