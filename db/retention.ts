import { and, isNotNull, isNull, lt } from 'drizzle-orm';

import { addDays, daysBetween, fromISODate, toISODate, todayISO, type ISODate } from '@/lib/dates';
import { transactions } from './schema';
import type { SyncDb } from './types';

/**
 * How long a deleted transaction is kept before it is really gone.
 *
 * Soft deletes (`deleted_at`) power undo, and nothing ever removed them — so a
 * row deleted in 2026 was still sitting in every non-partial index, and in
 * every backup, years later (TASKS2 5C). They now live in Settings → Recently
 * deleted for a month, then go.
 *
 * Like the analytics builders, the purge takes the database as a parameter, so
 * the test runs the SHIPPED predicate against the real migrated schema in
 * Node rather than a copy of it.
 */

export const RETENTION_DAYS = 30;

/**
 * The boundary: rows deleted before this LOCAL day began are purged, so a row
 * is kept for the whole of its final day.
 *
 * Days are local, but `deleted_at` is a UTC instant (`nowISO()`). Comparing its
 * first ten characters with a local date was wrong by the UTC offset (B25): in
 * IST a delete between 00:00 and 05:30 carries the previous day's UTC date, so
 * it was purged up to 5½ hours early and showed a day less than it had.
 * Everything below compares instants with instants, or local days with local days.
 */
export function purgeCutoff(today: ISODate = todayISO(), days: number = RETENTION_DAYS): ISODate {
  return addDays(today, -days);
}

/** The instant a local day begins, in the stored timestamp format, so it compares with `deleted_at` as text. */
export function startOfLocalDay(date: ISODate): string {
  return fromISODate(date).toISOString();
}

/** Days left before a deleted row is purged. 0 means "today is its last day". */
export function daysLeft(deletedAt: string, today: ISODate = todayISO(), days: number = RETENTION_DAYS): number {
  // The local day the row was deleted on, not the UTC date its timestamp starts with.
  const deletedOn = toISODate(new Date(deletedAt));
  return Math.max(0, days - daysBetween(deletedOn, today));
}

/**
 * Which rows a purge removes.
 *
 * Rows from an import batch are exempt: undoing a whole import is a separate
 * promise the app makes (`import_batches`), and it has to keep working for as
 * long as that batch exists.
 */
export function purgeWhere(cutoff: ISODate) {
  return and(
    isNotNull(transactions.deletedAt),
    lt(transactions.deletedAt, startOfLocalDay(cutoff)),
    isNull(transactions.importBatchId),
  );
}

/**
 * Remove expired soft-deleted transactions.
 *
 * Called once per launch after migrations, and safe to call at any time.
 * Returns how many rows went, for the dev log.
 */
export function purgeExpired(db: SyncDb, today: ISODate = todayISO(), days: number = RETENTION_DAYS): number {
  const result = db
    .delete(transactions)
    .where(purgeWhere(purgeCutoff(today, days)))
    .run();
  return Number((result as { changes?: number }).changes ?? 0);
}
