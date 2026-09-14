/**
 * Fan-in for database change events — pure, so coalescing is unit-tested.
 *
 * SQLite's update hook fires once PER CHANGED ROW. Drizzle's `useLiveQuery`
 * re-ran its whole query on every one of those, so a bulk soft-delete of 500
 * rows re-ran every mounted query 500 times. The hub instead collects events
 * for a short window and notifies each subscriber at most once per window.
 *
 * Subscribers name their tables explicitly. That matters twice over:
 *   - a query that JOINs `categories` must refresh when a category is
 *     renamed, but Drizzle's hook only watched the FROM table;
 *   - change events only ever name base tables, never views, so anything
 *     reading a view (Phase 6's `money_rows`) must list the tables beneath it.
 */

export type Schedule = (fn: () => void, ms: number) => unknown;
export type Cancel = (handle: unknown) => void;

export interface ChangeHub {
  /** Report that a row in `table` changed. */
  emit: (table: string) => void;
  /** Call `listener` (coalesced) whenever any of `tables` changes. Returns an unsubscribe. */
  subscribe: (tables: readonly string[], listener: () => void) => () => void;
}

interface Subscriber {
  tables: ReadonlySet<string>;
  listener: () => void;
  pending: unknown | null;
}

export const COALESCE_MS = 32;

export function createChangeHub(
  schedule: Schedule = (fn, ms) => setTimeout(fn, ms),
  cancel: Cancel = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  windowMs: number = COALESCE_MS,
): ChangeHub {
  const subscribers = new Set<Subscriber>();

  return {
    emit(table) {
      for (const sub of subscribers) {
        if (!sub.tables.has(table) || sub.pending != null) continue;
        sub.pending = schedule(() => {
          sub.pending = null;
          // Re-check membership: it may have unsubscribed inside the window.
          if (subscribers.has(sub)) sub.listener();
        }, windowMs);
      }
    },
    subscribe(tables, listener) {
      const sub: Subscriber = { tables: new Set(tables), listener, pending: null };
      subscribers.add(sub);
      return () => {
        subscribers.delete(sub);
        if (sub.pending != null) cancel(sub.pending);
        sub.pending = null;
      };
    },
  };
}
