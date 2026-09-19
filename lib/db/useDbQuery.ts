import { useIsFocused } from 'expo-router';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState, type DependencyList } from 'react';

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
  | 'app_meta'
  | 'people'
  | 'split_groups'
  | 'group_members'
  | 'split_expenses'
  | 'split_expense_payers'
  | 'split_expense_shares'
  | 'split_debts'
  | 'settlements';

export type QueryStatus = 'pending' | 'ok' | 'error';

/** What the hook stores; `refetch` is added to it on the way out. */
type QueryState<T> = Omit<DbQueryResult<T>, 'refetch'>;

export interface DbQueryResult<T> {
  data: T;
  status: QueryStatus;
  error: Error | null;
  /**
   * Run the query again now.
   *
   * For a retry after `status === 'error'`: a change event or a deps change
   * re-runs the query by itself, so this is only for the case where nothing
   * about the query has changed but the user wants another attempt. Before it
   * existed the ledger's "Try again" called a reset that did not alter the
   * deps, so nothing re-ran and the button did nothing (B7).
   *
   * An in-flight run is superseded, so hammering it cannot deliver a stale
   * answer after a newer one.
   */
  refetch: () => void;
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
 * @param options  `entity`: see below
 *
 * `deps` versus `options.entity`: a change in `deps` re-runs the query and
 * keeps showing the previous answer until the new one arrives, which is right
 * for a filter or a date. A change in `entity` means the query is now about a
 * DIFFERENT THING — another group, another friend — and the previous answer
 * must not be shown under the new heading for even a frame. So the result
 * resets to `pending` + `fallback` in the same render (R3-6). Before this,
 * opening group B straight after group A drew A's balances under B's name
 * until the new query answered.
 */
export function useDbQuery<T>(
  run: () => Promise<T>,
  tables: readonly TableName[],
  deps: DependencyList,
  fallback: T,
  options?: { entity?: unknown },
): DbQueryResult<T> {
  const runRef = useRef(run);
  runRef.current = run;

  const [result, setResult] = useState<QueryState<T>>(() => ({ data: fallback, status: 'pending', error: null }));

  // React's "adjust state while rendering" pattern: comparing with the entity
  // this state belongs to and resetting HERE, not in an effect, means the
  // stale answer is never painted — an effect would run after one frame of it.
  const entity = options?.entity;
  const [entityOfResult, setEntityOfResult] = useState<unknown>(entity);
  if (!Object.is(entity, entityOfResult)) {
    setEntityOfResult(entity);
    setResult({ data: fallback, status: 'pending', error: null });
  }
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

  // A new object each render would defeat memoisation in consumers, so the
  // identity only changes when the result or the callback does.
  return useMemo(() => ({ ...result, refetch: refresh }), [result, refresh]);
}
