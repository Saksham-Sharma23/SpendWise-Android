import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

/**
 * The only way to run a multi-statement write.
 *
 * Drizzle's expo driver is synchronous: `db.transaction(cb)` runs BEGIN,
 * calls `cb`, and COMMITs as soon as `cb` RETURNS. An `async` callback returns
 * a Promise at its first `await`, so everything after that await runs outside
 * the transaction — a crash then leaves a half-written ledger. This was live
 * in the dev seeder (chunk 1 inside, chunks 2–100 in autocommit).
 *
 * `runWriteTx` refuses a callback that returns a thenable by throwing INSIDE
 * the transaction, which rolls back whatever the callback had already written
 * before its first await. Use `.run()` / `.all()` on the `tx` handle — never
 * `await` — inside the callback.
 *
 * Pure (no native import) so it is proven against better-sqlite3 in Jest;
 * db/client.ts binds it to the app's handle as `writeTx`.
 */

// Deliberately NOT db/types.ts `SyncDb`: this guard is schema-agnostic, so its
// test can prove the early-commit bug against a throwaway schema.
type SyncDatabase = BaseSQLiteDatabase<'sync', any, any>;
type TxHandle<D extends SyncDatabase> = Parameters<Parameters<D['transaction']>[0]>[0];

export class AsyncTransactionError extends Error {
  constructor() {
    super(
      'writeTx callback returned a Promise. Drizzle commits when the callback returns, so awaited ' +
        'writes would run outside the transaction. Use synchronous .run()/.all() calls instead.',
    );
    this.name = 'AsyncTransactionError';
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export function runWriteTx<D extends SyncDatabase, T>(database: D, fn: (tx: TxHandle<D>) => T): T {
  return database.transaction((tx) => {
    const out = fn(tx as TxHandle<D>);
    if (isThenable(out)) {
      // Swallow the orphaned promise's own rejection; the throw below is the error that matters.
      Promise.resolve(out).catch(() => undefined);
      throw new AsyncTransactionError();
    }
    return out;
  }) as T;
}
