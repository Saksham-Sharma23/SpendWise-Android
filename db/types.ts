import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * The database handle types — declared ONCE (R3-1).
 *
 * Before this file the same `BaseSQLiteDatabase<…>` alias was redeclared five
 * times under five names (AnalyticsDb, GroupsDb, GroupsWriteDb, SyncDb,
 * RetentionDb, SeedDatabase), and the gaps between them were papered over
 * with `as unknown as` casts. A newcomer could not tell which to use.
 *
 * The run-result parameter is `any` on purpose: expo's driver, the
 * sqlite-proxy read handle and better-sqlite3 in tests all return different
 * run-result shapes, and no builder here reads it.
 */

type Schema = typeof schema;

/**
 * A synchronous handle — `db` from db/client.ts, a better-sqlite3 handle in
 * tests, or a transaction on either. What write cores take: `.run()` and
 * `.all()` return values, never promises, which is what `writeTx` requires.
 */

export type SyncDb = BaseSQLiteDatabase<'sync', any, Schema>;

/**
 * Either handle. What READ builders take, so the same builder runs on the
 * phone through `readDb` (async, off the JS thread) and in Node tests on
 * better-sqlite3 (sync). Tests therefore exercise the SHIPPED SQL
 * (CLAUDE.md #18), not a copy of it.
 */

export type AnyDb = BaseSQLiteDatabase<'sync' | 'async', any, Schema>;

/**
 * Execute a read builder synchronously, on a handle you KNOW is sync.
 *
 * A builder typed for `AnyDb` returns a query whose `.all()` is typed as
 * "rows, or a promise of rows", because the type system cannot know which
 * handle built it. Where a builder is deliberately run on the sync handle —
 * an edit form's prefill, a guard inside a write — this is the one place that
 * says so, instead of an `as unknown as { all(): … }` at every call site.
 */
export function allSync<T>(query: { all(): unknown }): T[] {
  const rows = query.all();
  if (rows instanceof Promise) {
    throw new Error('allSync() was given a query built on the ASYNC read handle; use await instead.');
  }
  return rows as T[];
}
