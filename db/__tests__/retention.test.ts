import { isNull } from 'drizzle-orm';

import { daysLeft, purgeCutoff, purgeExpired, RETENTION_DAYS } from '../retention';
import { importBatches, transactions } from '../schema';
import { freshDb } from './support';

/**
 * The purge, against the real migrated schema (TASKS2 5C).
 *
 * This is a test worth having: it is the only code in the app that removes a
 * row permanently, it runs unattended at every launch, and its predicate
 * compares a DATE against a TIMESTAMP as text. Getting the boundary wrong by
 * one day deletes something a user could still have restored.
 */

type Db = Awaited<ReturnType<typeof freshDb>>['db'];

const TODAY = '2026-09-17';

async function seeded() {
  const { db } = await freshDb();
  db.insert(importBatches)
    .values({ id: 1, uid: 'b1', sourceName: 'march.csv', rowsImported: 2, createdAt: '2026-01-01T00:00:00.000Z' })
    .run();

  const row = (id: number, deletedAt: string | null, importBatchId: number | null = null) => ({
    id,
    type: 'expense' as const,
    amountPaise: 1000 + id,
    date: '2026-01-05',
    note: `row ${id}`,
    importBatchId,
    deletedAt,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  });

  db.insert(transactions)
    .values([
      row(1, null), // live
      row(2, '2026-09-16T10:00:00.000Z'), // deleted yesterday
      row(3, '2026-08-18T09:12:00.000Z'), // exactly 30 days ago — its last day
      row(4, '2026-08-17T23:59:59.999Z'), // 31 days ago
      row(5, '2026-01-02T00:00:00.000Z'), // ancient
      row(6, '2026-01-02T00:00:00.000Z', 1), // ancient, but part of an import batch
    ])
    .run();
  return db;
}

const ids = (db: Db) =>
  db
    .select({ id: transactions.id })
    .from(transactions)
    .all()
    .map((r) => r.id)
    .sort();

describe('purgeCutoff', () => {
  it('is 30 days back by default', () => {
    expect(purgeCutoff('2026-09-17')).toBe('2026-08-18');
    expect(RETENTION_DAYS).toBe(30);
  });

  it('crosses a month and a leap day correctly', () => {
    expect(purgeCutoff('2024-03-15')).toBe('2024-02-14');
    expect(purgeCutoff('2026-01-10')).toBe('2025-12-11');
  });
});

describe('purgeExpired', () => {
  it('removes only rows deleted before the cutoff', async () => {
    const db = await seeded();
    purgeExpired(db, TODAY);
    // 4 and 5 are past the window; 6 is exempt (import batch).
    expect(ids(db)).toEqual([1, 2, 3, 6]);
  });

  it('keeps a row for the whole of its last day', async () => {
    // Deleted at 09:12 on the cutoff date itself. Comparing a timestamp
    // against a bare date as text is exactly where an off-by-one would live.
    const db = await seeded();
    purgeExpired(db, TODAY);
    expect(ids(db)).toContain(3);
    // One day later it goes.
    purgeExpired(db, '2026-09-18');
    expect(ids(db)).not.toContain(3);
  });

  it('never touches a live row', async () => {
    const db = await seeded();
    purgeExpired(db, '2030-01-01');
    expect(db.select().from(transactions).where(isNull(transactions.deletedAt)).all()).toHaveLength(1);
  });

  it('spares rows belonging to an import batch, so batch undo keeps working', async () => {
    const db = await seeded();
    purgeExpired(db, '2030-01-01');
    expect(ids(db)).toEqual([1, 6]);
  });

  it('is safe to run twice, and on an empty window', async () => {
    const db = await seeded();
    expect(purgeExpired(db, TODAY)).toBe(2);
    expect(purgeExpired(db, TODAY)).toBe(0);
  });
});

describe('daysLeft', () => {
  it('counts down to the purge', () => {
    expect(daysLeft('2026-09-17T08:00:00.000Z', TODAY)).toBe(30);
    expect(daysLeft('2026-09-16T08:00:00.000Z', TODAY)).toBe(29);
    expect(daysLeft('2026-08-18T08:00:00.000Z', TODAY)).toBe(0);
  });

  it('never goes negative for a row the purge has not reached yet', () => {
    expect(daysLeft('2020-01-01T00:00:00.000Z', TODAY)).toBe(0);
  });
});
