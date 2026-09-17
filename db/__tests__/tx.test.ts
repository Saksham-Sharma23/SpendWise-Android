import { sql } from 'drizzle-orm';

import { categories, transactions } from '../schema';
import { AsyncTransactionError, runWriteTx } from '../tx';
import { freshDb } from './support';

/**
 * [D2] The transaction guard, against a real migrated schema.
 *
 * better-sqlite3's Drizzle driver is synchronous like the expo one, so
 * "commit happens when the callback returns" holds here too.
 */

const count = (d: Awaited<ReturnType<typeof freshDb>>['db']) =>
  d
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .all()[0]!.n;

const row = (i: number) => ({ type: 'expense' as const, amountPaise: 100 + i, date: '2026-09-14' });

describe('runWriteTx', () => {
  it('commits every write of a synchronous callback', async () => {
    const { db } = await freshDb();
    runWriteTx(db, (tx) => {
      for (let i = 0; i < 5; i++) tx.insert(transactions).values(row(i)).run();
    });
    expect(count(db)).toBe(5);
  });

  it('returns the callback value', async () => {
    const { db } = await freshDb();
    const id = runWriteTx(
      db,
      (tx) => tx.insert(categories).values({ name: 'Coffee' }).returning({ id: categories.id }).all()[0]!.id,
    );
    expect(id).toBeGreaterThan(0);
  });

  it('rolls back everything when the callback throws mid-batch', async () => {
    const { db } = await freshDb();
    expect(() =>
      runWriteTx(db, (tx) => {
        for (let i = 0; i < 3; i++) tx.insert(transactions).values(row(i)).run();
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(count(db)).toBe(0);
  });
});

/**
 * better-sqlite3's own transaction() already refuses a Promise-returning
 * callback, so it cannot show the bug. This stand-in has EXACTLY the expo
 * driver's semantics (drizzle-orm/expo-sqlite/session.js): BEGIN, call the
 * callback, COMMIT when it returns, ROLLBACK only if it throws synchronously.
 */
async function expoLikeDb() {
  const { sqlite, db } = await freshDb();
  const expoTransaction = (cb: (tx: typeof db) => unknown) => {
    sqlite.exec('BEGIN');
    try {
      const out = cb(db);
      sqlite.exec('COMMIT');
      return out;
    } catch (e) {
      sqlite.exec('ROLLBACK');
      throw e;
    }
  };
  const expo = { transaction: expoTransaction } as unknown as typeof db;
  return { db, expo };
}

describe('[D2] async callbacks under the expo driver semantics', () => {
  const asyncWork = async (tx: Awaited<ReturnType<typeof freshDb>>['db']) => {
    tx.insert(transactions).values(row(1)).run(); // runs synchronously, inside BEGIN
    await Promise.resolve();
    tx.insert(transactions).values(row(2)).run(); // runs after COMMIT — outside the transaction
    throw new Error('late failure'); // too late to roll anything back
  };

  it('WITHOUT the guard: an async callback commits early and a later failure cannot roll back', async () => {
    const { db, expo } = await expoLikeDb();
    const p = (expo.transaction as unknown as (cb: typeof asyncWork) => Promise<void>)(asyncWork);
    await expect(p).rejects.toThrow('late failure');
    expect(count(db)).toBe(2); // half-finished work, permanently committed
  });

  it('WITH runWriteTx: the async callback is refused and its first write rolled back', async () => {
    const { db, expo } = await expoLikeDb();
    expect(() => runWriteTx(expo, asyncWork as never)).toThrow(AsyncTransactionError);
    await new Promise((r) => setTimeout(r, 10)); // let the orphaned continuation run and fail
    // The continuation's insert ran in autocommit after the rollback; the first one did not survive.
    expect(count(db)).toBeLessThanOrEqual(1);
    const survivors = db
      .select({ amount: transactions.amountPaise })
      .from(transactions)
      .all()
      .map((r) => r.amount);
    expect(survivors).not.toContain(101);
  });
});
