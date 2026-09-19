import { freshDb } from '@/db/__tests__/support';
import { importBatches, transactions } from '@/db/schema';
import { DELETED_LIST_LIMIT, deletedCountQuery, deletedTransactionsQuery } from '../data/sql';
import { purgeAllDeleted, purgeTransactions } from '../data/writes';

/**
 * B24 — "Empty" in Settings → Recently deleted removes EVERYTHING it holds.
 *
 * The list stops at DELETED_LIST_LIMIT rows, and "Empty" used to pass the ids
 * it had listed, so after a bulk delete of more than that it left the rest
 * behind while its dialog said "Everything … will be gone for good".
 */

const DELETED = DELETED_LIST_LIMIT + 100;

async function seeded() {
  const fresh = await freshDb();
  const { db } = fresh;
  db.insert(importBatches)
    .values({ id: 1, uid: 'b1', sourceName: 'march.csv', rowsImported: 1, createdAt: '2026-01-01T00:00:00.000Z' })
    .run();

  const row = (id: number, deletedAt: string | null, importBatchId: number | null = null) => ({
    id,
    type: 'expense' as const,
    amountPaise: 100 * id,
    date: '2026-09-01',
    note: `row ${id}`,
    importBatchId,
    deletedAt,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  });

  const rows = [row(1, null), row(2, '2026-09-10T10:00:00.000Z', 1)];
  for (let i = 0; i < DELETED; i++) rows.push(row(100 + i, '2026-09-12T10:00:00.000Z'));
  // SQLite caps host parameters, so insert in chunks.
  for (let i = 0; i < rows.length; i += 50)
    db.insert(transactions)
      .values(rows.slice(i, i + 50))
      .run();
  return fresh;
}

const remaining = (db: Awaited<ReturnType<typeof freshDb>>['db']) =>
  db
    .select({ id: transactions.id })
    .from(transactions)
    .all()
    .map((r) => r.id)
    .sort((a, b) => a - b);

describe('Recently deleted (B24)', () => {
  it('lists the newest rows but counts all of them, import-batch rows excluded', async () => {
    const { db, sqlite } = await seeded();

    expect(await deletedTransactionsQuery(db)).toHaveLength(DELETED_LIST_LIMIT);
    expect(await deletedCountQuery(db)).toEqual([{ n: DELETED }]);
    sqlite.close();
  });

  it('shows the bug: purging only the listed ids leaves the rest behind', async () => {
    const { db, sqlite } = await seeded();

    const listed = (await deletedTransactionsQuery(db)).map((r) => r.id);
    purgeTransactions(db, listed);

    expect(await deletedCountQuery(db)).toEqual([{ n: DELETED - DELETED_LIST_LIMIT }]);
    sqlite.close();
  });

  it('"Empty" removes every row it holds, and nothing else', async () => {
    const { db, sqlite } = await seeded();

    expect(purgeAllDeleted(db)).toBe(DELETED);

    expect(await deletedCountQuery(db)).toEqual([{ n: 0 }]);
    // The live row and the deleted import-batch row (undone with its batch) survive.
    expect(remaining(db)).toEqual([1, 2]);
    sqlite.close();
  });
});
