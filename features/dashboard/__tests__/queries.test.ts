import type Database from 'better-sqlite3';

import { categories, transactions } from '@/db/schema';
import { freshDb } from '@/db/__tests__/support';
import { topCategoriesQuery, trendQuery } from '../data/sql';

/**
 * The SHIPPED dashboard builders, run against the real migrated schema
 * (convention #18).
 *
 * These exist because of B1: "Where it went" bounded only the START of the
 * month while the month overview bounded both ends, so a future-dated expense
 * counted in one and not the other and a category's share could exceed 100%.
 * The date picker allows a year ahead, so that input is ordinary, not exotic.
 */

type Fresh = Awaited<ReturnType<typeof freshDb>>;

const TODAY = '2026-09-17';

async function ledger() {
  const fresh = await freshDb();
  const { db } = fresh;
  db.insert(categories)
    .values([
      { id: 1, uid: 'c1', name: 'Food', icon: 'utensils', color: '#E8833A', kind: 'expense' },
      { id: 2, uid: 'c2', name: 'Travel', icon: 'plane', color: '#3A7CA5', kind: 'expense' },
    ])
    .run();

  let n = 0;
  const tx = (amountPaise: number, date: string, categoryId: number | null, deleted = false) => {
    n += 1;
    db.insert(transactions)
      .values({
        uid: `t${n}`,
        type: 'expense',
        amountPaise,
        date,
        categoryId,
        deletedAt: deleted ? '2026-09-01T00:00:00.000Z' : null,
      })
      .run();
  };

  // This month.
  tx(1_000_00, '2026-09-02', 1);
  tx(500_00, '2026-09-10', 2);
  // Last month: must not leak into "this month".
  tx(9_000_00, '2026-08-20', 1);
  // NEXT month — the bug. Allowed by the date picker, must not count yet.
  tx(5_000_00, '2026-10-03', 1);
  // Soft-deleted this month: never counted.
  tx(7_000_00, '2026-09-05', 1, true);

  return fresh;
}

describe('topCategoriesQuery', () => {
  let fresh: Fresh;
  beforeAll(async () => {
    fresh = await ledger();
  });
  afterAll(() => (fresh.sqlite as Database.Database).close());

  it('counts only this month: a future-dated expense is excluded', () => {
    const rows = topCategoriesQuery(fresh.db, TODAY, 4).all() as {
      id: number | null;
      totalPaise: number;
    }[];

    const byId = new Map(rows.map((r) => [r.id, r.totalPaise]));
    // Food this month is 1,000 — NOT 6,000 (which would include 3 Oct).
    expect(byId.get(1)).toBe(1_000_00);
    expect(byId.get(2)).toBe(500_00);
  });

  it('never lets the shares sum past the month total', () => {
    const rows = topCategoriesQuery(fresh.db, TODAY, 10).all() as {
      totalPaise: number;
    }[];
    const summed = rows.reduce((a, r) => a + r.totalPaise, 0);
    // The month's live expense total, bounded on both ends exactly as the
    // overview query does it.
    expect(summed).toBe(1_500_00);
  });
});

describe('trendQuery', () => {
  let fresh: Fresh;
  beforeAll(async () => {
    fresh = await ledger();
  });
  afterAll(() => (fresh.sqlite as Database.Database).close());

  it('stops at the current month, so the chart and the cards agree', () => {
    const rows = trendQuery(fresh.db, 6, TODAY).all() as {
      month: string;
      expensePaise: number;
    }[];

    expect(rows.map((r) => r.month)).not.toContain('2026-10');
    expect(rows.find((r) => r.month === '2026-09')?.expensePaise).toBe(1_500_00);
    expect(rows.find((r) => r.month === '2026-08')?.expensePaise).toBe(9_000_00);
  });
});
