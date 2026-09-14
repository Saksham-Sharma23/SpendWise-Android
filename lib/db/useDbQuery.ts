import { useIsFocused } from 'expo-router';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { createChangeHub } from './changeHub';
import { createLatestOnly } from './latestOnly';

/**
 * The app's live-query hook. Replaces Drizzle's `useLiveQuery`, which:
 *   1. re-ran its query once per changed ROW (a 500-row delete = 500 re-runs),
 *   2. watched only the FROM table, so renaming a category never refreshed the
 *      ledger or dashboard rows that join `categories`,
 *   3. let a slow, stale result overwrite a newer one,
 *   4. swallowed errors, so a failing query rendered as "No transactions yet",
 *   5. started at `[]`, so every mount flashed its empty state.
 *
 * `run` is ASYNC and should query through db/read.ts, which executes on
 * expo-sqlite's native worker thread — the JS thread only receives rows.
 *
 * Status:
 *   'pending'  no result yet (first load). Render nothing new — NOT the empty state.
 *   'ok'       `data` is a real result. Only now may an empty result show "Empty".
 *   'error'    the query failed; `data` keeps the last good result (or fallback).
 * After the first result, re-runs keep the current `data` and status until the
 * new result lands, so a refresh never flashes.
 *
 * Re-runs: when deps change (immediately), and when any of `tables` changes
 * (coalesced by the change hub). While the screen is unfocused it only records
 * that it is stale, then refreshes once on focus.
 *
 * Rule: list EVERY base table the query reads, including joins. Change events
 * never name views — a query over a view must list the view's base tables.
 */

export type TableName =
  | 'transactions'
  | 'categories'
  | 'budgets'
  | 'subscriptions'
  | 'import_batches'
  | 'app_meta';

export type QueryStatus = 'pending' | 'ok' | 'error';

export interface DbQueryResult<T> {
  data: T;
  status: QueryStatus;
  error: Error | null;
}

// One native listener for the whole app, fanned out through the hub.
const hub = createChangeHub();
let nativeSubscribed = false;
function ensureNativeListener() {
  if (nativeSubscribed) return;
  nativeSubscribed = true;
  addDatabaseChangeListener((event) => hub.emit(event.tableName));
}

/**
 * @param run      async query, e.g. `() => readDb.select()…` (awaited)
 * @param tables   every base table the query reads
 * @param deps     values the query depends on (like useMemo deps)
 * @param fallback what `data` is before the first result, or if it never succeeds
 */
export function useDbQuery<T>(
  run: () => Promise<T>,
  tables: readonly TableName[],
  deps: DependencyList,
  fallback: T,
): DbQueryResult<T> {
  const runRef = useRef(run);
  runRef.current = run;

  const [result, setResult] = useState<DbQueryResult<T>>(() => ({ data: fallback, status: 'pending', error: null }));
  const isFocused = useIsFocused();
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;
  const staleRef = useRef(false);
  const latest = useRef(createLatestOnly()).current;

  const refresh = useCallback(() => {
    const ticket = latest.begin();
    runRef.current().then(
      (data) => {
        if (latest.isCurrent(ticket)) setResult({ data, status: 'ok', error: null });
      },
      (e: unknown) => {
        if (!latest.isCurrent(ticket)) return;
        if (__DEV__) console.warn('[useDbQuery] query failed', e);
        const error = e instanceof Error ? e : new Error(String(e));
        setResult((prev) => ({ data: prev.data, status: 'error', error }));
      },
    );
  }, [latest]);

  // Mount and deps change → run now. A newer run makes any in-flight one stale.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Unmount → ignore anything still in flight.
  useEffect(() => () => latest.cancel(), [latest]);

  // Data changed → re-run, coalesced; defer while unfocused.
  const tableKey = tables.join(',');
  useEffect(() => {
    ensureNativeListener();
    return hub.subscribe(tableKey.split(','), () => {
      if (focusedRef.current) refresh();
      else staleRef.current = true;
    });
  }, [tableKey, refresh]);

  // Regained focus with missed changes → one refresh.
  useEffect(() => {
    if (isFocused && staleRef.current) {
      staleRef.current = false;
      refresh();
    }
  }, [isFocused, refresh]);

  return result;
}
