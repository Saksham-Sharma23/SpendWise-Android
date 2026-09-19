import { and, desc, eq } from 'drizzle-orm';

import { categories, transactions } from '@/db/schema';
import { freshDb } from '@/db/__tests__/support';
import { atOrNewerThan, buildWhere, olderThan, type LedgerKey, type TransactionFilters } from '../data/filters';

/**
 * The ledger's keyset queries against the REAL migrated schema: pages built
 * from `olderThan` must tile the ledger exactly — every row once, in order —
 * and stay tiled when rows are inserted at the top, which is the case OFFSET
 * paging gets wrong.
 */

async function makeDb() {
  const { sqlite, db } = await freshDb();
  db.insert(categories)
    .values([{ id: 1, name: 'Food', uid: 'c1', kind: 'expense' }])
    .run();
  // 97 rows over a handful of dates, so many share a date and the id
  // tiebreak is genuinely exercised.
  const rows = Array.from({ length: 97 }, (_, i) => ({
    uid: `t${i + 1}`,
    type: 'expense' as const,
    amountPaise: 100 + i,
    date: `2026-09-${String(1 + (i % 9)).padStart(2, '0')}`,
    note: i % 5 === 0 ? 'chai' : 'lunch',
    categoryId: 1,
  }));
  db.insert(transactions).values(rows).run();
  return { sqlite, db };
}

type Db = Awaited<ReturnType<typeof makeDb>>['db'];

function page(db: Db, filters: TransactionFilters, after: LedgerKey | null, size: number) {
  return db
    .select({ id: transactions.id, date: transactions.date })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(buildWhere(filters), after ? olderThan(after) : undefined))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(size)
    .all();
}

function allRows(db: Db, filters: TransactionFilters) {
  return db
    .select({ id: transactions.id, date: transactions.date })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildWhere(filters))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();
}

function walk(db: Db, filters: TransactionFilters, size: number) {
  const out: { id: number; date: string }[] = [];
  let after: LedgerKey | null = null;
  for (;;) {
    const rows = page(db, filters, after, size);
    out.push(...rows);
    if (rows.length < size) return out;
    after = rows[rows.length - 1]!;
  }
}

describe('keyset paging', () => {
  it('tiles the whole ledger exactly once, in order', async () => {
    const { db } = await makeDb();
    expect(walk(db, { type: 'all' }, 40)).toEqual(allRows(db, { type: 'all' }));
  });

  it('tiles a filtered ledger too', async () => {
    const { db } = await makeDb();
    const f: TransactionFilters = { type: 'all', search: 'chai' };
    const walked = walk(db, f, 7);
    expect(walked).toEqual(allRows(db, f));
    expect(walked.length).toBe(20);
  });

  it('a row inserted at the top does not shift older pages (unlike OFFSET)', async () => {
    const { db } = await makeDb();
    const first = page(db, { type: 'all' }, null, 40);
    const boundary = first[first.length - 1]!;
    const secondBefore = page(db, { type: 'all' }, boundary, 40);

    db.insert(transactions)
      .values({ uid: 'new', type: 'expense', amountPaise: 1, date: '2026-09-30', categoryId: 1 })
      .run();

    // The older page, keyed on the same boundary, is unchanged…
    expect(page(db, { type: 'all' }, boundary, 40)).toEqual(secondBefore);
    // …and the live page, now bounded by that key rather than a LIMIT, gains the new row.
    const live = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(buildWhere({ type: 'all' }), atOrNewerThan(boundary)))
      .all();
    expect(live.length).toBe(41);
  });

  it('walks the ledger index with no temporary sort', async () => {
    const { sqlite } = await makeDb();
    const plan = sqlite
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id FROM transactions
          WHERE deleted_at IS NULL AND (date, id) < ('2026-09-05', 40)
          ORDER BY date DESC, id DESC LIMIT 40`,
      )
      .all()
      .map((r) => (r as { detail: string }).detail)
      .join(' | ');
    expect(plan).not.toMatch(/TEMP B-TREE/);
  });
});
