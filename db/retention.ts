import { and, isNotNull, isNull, lt } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { addDays, todayISO, type ISODate } from '@/lib/dates';
import { transactions } from './schema';
import type * as schema from './schema';

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

export type RetentionDb = BaseSQLiteDatabase<'sync', any, typeof schema>;

export const RETENTION_DAYS = 30;

/**
 * The boundary: rows deleted STRICTLY BEFORE this date are purged.
 *
 * `deleted_at` is a full ISO timestamp and this is a plain date, which compare
 * correctly as text because the timestamp begins with its own date: on the
 * cutoff day itself '2026-08-18T09:12:…' sorts after '2026-08-18', so a row is
 * kept for the whole of its final day.
 */
export function purgeCutoff(today: ISODate = todayISO(), days: number = RETENTION_DAYS): ISODate {
  return addDays(today, -days);
}

/** Days left before a deleted row is purged. 0 means "today is its last day". */
export function daysLeft(deletedAt: string, today: ISODate = todayISO(), days: number = RETENTION_DAYS): number {
  const elapsed = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${deletedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000,
  );
  return Math.max(0, days - elapsed);
}

/**
 * Which rows a purge removes.
 *
 * Rows from an import batch are exempt: undoing a whole import is a separate
 * promise the app makes (`import_batches`), and it has to keep working for as
 * long as that batch exists.
 */
export function purgeWhere(cutoff: ISODate) {
  return and(isNotNull(transactions.deletedAt), lt(transactions.deletedAt, cutoff), isNull(transactions.importBatchId));
}

/**
 * Remove expired soft-deleted transactions.
 *
 * Called once per launch after migrations, and safe to call at any time.
 * Returns how many rows went, for the dev log.
 */
export function purgeExpired(db: RetentionDb, today: ISODate = todayISO(), days: number = RETENTION_DAYS): number {
  const result = db
    .delete(transactions)
    .where(purgeWhere(purgeCutoff(today, days)))
    .run();
  return Number((result as { changes?: number }).changes ?? 0);
}
