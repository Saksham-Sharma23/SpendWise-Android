import type Database from 'better-sqlite3';

import { categories, transactions } from '@/db/schema';
import { freshDb } from '@/db/__tests__/support';
import { biggestExpenseQuery, categoryTotalsQuery, earliestDateQuery, totalsQuery, trendQuery } from '../sql';
import type { AnyDb } from '@/db/types';

/**
 * The SHIPPED analytics builders, executed against the real migrated schema.
 * Correctness on a small hand-made ledger, then query plans on 50,000 rows:
 * the plan is what decides whether a query that is fast today is still fast
 * at 200k.
 */

type Fresh = Awaited<ReturnType<typeof freshDb>>;

async function small() {
  const fresh = await freshDb();
  const { db } = fresh;
  db.insert(categories)
    .values([
      { id: 1, uid: 'c1', name: 'Food', icon: 'utensils', color: '#E8833A', kind: 'expense' },
      { id: 2, uid: 'c2', name: 'Travel', icon: 'plane', color: '#3A7CA5', kind: 'expense' },
      { id: 3, uid: 'c3', name: 'Salary', icon: 'briefcase', color: '#4B9B6E', kind: 'income' },
    ])
    .run();
  let n = 0;
  const tx = (
    type: 'expense' | 'income',
    amountPaise: number,
    date: string,
    categoryId: number | null,
    extra: { note?: string; deleted?: boolean } = {},
  ) => {
    n += 1;
    db.insert(transactions)
      .values({
        uid: `t${n}`,
        type,
        amountPaise,
        date,
        categoryId,
        note: extra.note ?? null,
        deletedAt: extra.deleted ? '2026-09-01T00:00:00.000Z' : null,
      })
      .run();
  };

  tx('income', 80_000_00, '2026-07-01', 3);
  tx('expense', 1_200_00, '2026-07-04', 1);
  tx('expense', 9_500_00, '2026-07-19', 2, { note: 'Flights' });
  tx('income', 80_000_00, '2026-08-01', 3);
  tx('expense', 450_00, '2026-08-02', 1);
  tx('expense', 700_00, '2026-08-09', null); // uncategorised
  tx('expense', 99_999_00, '2026-08-10', 2, { deleted: true }); // must never count
  tx('expense', 2_000_00, '2026-09-03', 1);
  tx('expense', 30_000_00, '2025-12-24', 2, { note: 'Out of range' });

  return { ...fresh, db: fresh.db };
}

describe('analytics SQL — correctness', () => {
  let ctx: Awaited<ReturnType<typeof small>>;
  beforeAll(async () => {
    ctx = await small();
  });
  afterAll(() => ctx.sqlite.close());

  it('trend: one row per month with data, oldest first, deleted rows excluded', async () => {
    const rows = await trendQuery(ctx.db, '2026-07', '2026-09');
    expect(rows).toEqual([
      { month: '2026-07', incomePaise: 80_000_00, expensePaise: 10_700_00 },
      { month: '2026-08', incomePaise: 80_000_00, expensePaise: 1_150_00 },
      { month: '2026-09', incomePaise: 0, expensePaise: 2_000_00 },
    ]);
  });

  it('totals: the range summed in one row', async () => {
    const [row] = await totalsQuery(ctx.db, '2026-07', '2026-09');
    expect(row).toEqual({ incomePaise: 160_000_00, expensePaise: 13_850_00, count: 7 });
  });

  it('totals: an empty range sums to zero, not NULL', async () => {
    const [row] = await totalsQuery(ctx.db, '2030-01', '2030-12');
    expect(row).toEqual({ incomePaise: 0, expensePaise: 0, count: 0 });
  });

  it('earliest date ignores nothing live and everything deleted', async () => {
    const [row] = await earliestDateQuery(ctx.db, '2026-09');
    expect(row?.date).toBe('2025-12-24');
  });

  it('biggest expense: the largest live expense in range, with its category', async () => {
    const [row] = await biggestExpenseQuery(ctx.db, '2026-07', '2026-09');
    // The deleted 99,999 and the out-of-range 30,000 must both lose.
    expect(row).toMatchObject({
      amountPaise: 9_500_00,
      date: '2026-07-19',
      note: 'Flights',
      categoryName: 'Travel',
      categoryIcon: 'plane',
    });
  });

  it('biggest expense: an empty range yields a NULL amount', async () => {
    const [row] = await biggestExpenseQuery(ctx.db, '2030-01', '2030-12');
    expect(row?.amountPaise).toBeNull();
  });

  it('category totals: one month, largest first, uncategorised as a NULL id', async () => {
    const rows = await categoryTotalsQuery(ctx.db, '2026-08', '2026-08');
    expect(rows).toEqual([
      { id: null, name: null, color: null, icon: null, totalPaise: 700_00 },
      { id: 1, name: 'Food', color: '#E8833A', icon: 'utensils', totalPaise: 450_00 },
    ]);
  });

  it('category totals: a range, limited to the top one', async () => {
    const rows = await categoryTotalsQuery(ctx.db, '2026-07', '2026-09', 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 2, name: 'Travel', totalPaise: 9_500_00 });
  });

  it('never counts income as spend', async () => {
    const rows = await categoryTotalsQuery(ctx.db, '2026-07', '2026-09');
    expect(rows.find((r) => r.name === 'Salary')).toBeUndefined();
  });
});

/**
 * B2: `trendQuery`, `totalsQuery` and `biggestExpenseQuery` had no upper bound
 * while `categoryTotalsQuery` did, so a future-dated row (the picker allows a
 * year ahead) inflated the stat cards while the chart dropped it — one screen
 * disagreeing with itself.
 *
 * The last test here is the one that matters long-term: it ties the chart and
 * the cards together, so any future change that bounds one and not the other
 * fails regardless of which bound moved.
 */
describe('analytics SQL — every range is bounded at both ends (B2)', () => {
  let ctx: Awaited<ReturnType<typeof small>>;
  beforeAll(async () => {
    ctx = await small();
    // A transaction dated NEXT month, as the date picker permits.
    ctx.db
      .insert(transactions)
      .values({ uid: 'future', type: 'expense', amountPaise: 50_000_00, date: '2026-10-05', categoryId: 2 })
      .run();
  });
  afterAll(() => ctx.sqlite.close());

  const RANGE = ['2026-07', '2026-09'] as const;

  it('totals exclude a future-dated expense', async () => {
    const [row] = await totalsQuery(ctx.db, ...RANGE);
    expect(row?.expensePaise).toBe(13_850_00);
    expect(row?.count).toBe(7);
  });

  it('the trend stops at the current month', async () => {
    const rows = await trendQuery(ctx.db, ...RANGE);
    expect(rows.map((r) => r.month)).not.toContain('2026-10');
  });

  it('the biggest expense is not a future one', async () => {
    const [row] = await biggestExpenseQuery(ctx.db, ...RANGE);
    expect(row?.amountPaise).toBe(9_500_00);
  });

  it('the earliest date ignores months beyond the range', async () => {
    const [row] = await earliestDateQuery(ctx.db, '2026-09');
    expect(row?.date).toBe('2025-12-24');
  });

  it('the trend sums to exactly what the totals card shows', async () => {
    const [totals] = await totalsQuery(ctx.db, ...RANGE);
    const trend = await trendQuery(ctx.db, ...RANGE);
    const summed = trend.reduce(
      (acc, r) => ({ income: acc.income + r.incomePaise, expense: acc.expense + r.expensePaise }),
      { income: 0, expense: 0 },
    );
    expect(summed.income).toBe(totals?.incomePaise);
    expect(summed.expense).toBe(totals?.expensePaise);
  });
});

describe('analytics SQL — plans at 50k rows', () => {
  let fresh: Fresh;
  let db: AnyDb;

  beforeAll(async () => {
    fresh = await freshDb();
    db = fresh.db;
    seed(fresh.sqlite, 50_000);
  }, 120_000);
  afterAll(() => fresh.sqlite.close());

  function planOf(q: { toSQL(): { sql: string; params: unknown[] } }): string {
    const { sql, params } = q.toSQL();
    return (fresh.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[])
      .map((r) => r.detail)
      .join(' | ');
  }

  it('trend walks tx_month_idx with no sort', () => {
    const p = planOf(trendQuery(db, '2024-10', '2026-09'));
    expect(p).toMatch(/INDEX tx_month_idx/);
    expect(p).not.toMatch(/TEMP B-TREE/);
  });

  it('totals walk tx_month_idx', () => {
    const p = planOf(totalsQuery(db, '2024-10', '2026-09'));
    expect(p).toMatch(/INDEX tx_month_idx/);
    expect(p).not.toMatch(/SCAN transactions(?! USING)/);
  });

  it('earliest date is a lookup on tx_ledger_idx, not a scan', () => {
    const p = planOf(earliestDateQuery(db, '2026-09'));
    expect(p).toMatch(/tx_ledger_idx/);
    expect(p).not.toMatch(/SCAN transactions(?! USING)/);
  });

  it('biggest expense finds its row without a sort step', () => {
    const p = planOf(biggestExpenseQuery(db, '2024-10', '2026-09'));
    expect(p).toMatch(/INDEX tx_month_idx/);
    expect(p).not.toMatch(/TEMP B-TREE/);
  });

  it('category totals range over tx_month_idx rather than scanning the table', () => {
    const p = planOf(categoryTotalsQuery(db, '2024-10', '2026-09'));
    expect(p).not.toMatch(/SCAN transactions(?! USING)/);
  });

  it('24 months of 50k rows reach JS as at most 24 trend rows', async () => {
    const rows = await trendQuery(db, '2024-10', '2026-09');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(24);
    for (const r of rows) {
      expect(Number.isInteger(r.incomePaise)).toBe(true);
      expect(Number.isInteger(r.expensePaise)).toBe(true);
    }
  });
});

function seed(sqlite: Database.Database, count: number): void {
  const cats = [
    'Food & Dining',
    'Groceries',
    'Transport',
    'Shopping',
    'Entertainment',
    'Bills & Utilities',
    'Health',
    'Salary',
  ];
  const insertCat = sqlite.prepare(
    "INSERT INTO categories (name, icon, color, is_system) VALUES (?, 'circle', '#888888', 1)",
  );
  for (const c of cats) insertCat.run(c);
  const insertTx = sqlite.prepare(
    'INSERT INTO transactions (type, amount_paise, date, category_id, created_at, updated_at) VALUES (?,?,?,?,?,?)',
  );
  let s = 777;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const start = new Date('2022-10-01').getTime();
  sqlite.transaction(() => {
    for (let i = 0; i < count; i++) {
      const date = new Date(start + Math.floor(rand() * 4 * 365) * 86_400_000).toISOString().slice(0, 10);
      const isIncome = rand() < 0.08;
      const amount = isIncome ? Math.round((35_000 + rand() * 60_000) * 100) : Math.round((20 + rand() * 3_000) * 100);
      insertTx.run(isIncome ? 'income' : 'expense', amount, date, Math.floor(rand() * cats.length) + 1, 'now', 'now');
    }
  })();
  sqlite.exec('ANALYZE');
}
