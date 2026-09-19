import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { desc, eq } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import * as schema from '@/db/schema';
import { categories, transactions } from '@/db/schema';
import { allSync } from '@/db/types';
import { buildWhere, hasActiveFilters, resolveDateRange, type TransactionFilters } from '../data/filters';
import { summaryQuery } from '../data/sql';

/**
 * Drives the REAL filter builder against a REAL database in Node.
 *
 * `buildWhere` touches only schema columns, never the expo-sqlite handle, so
 * the same code the app runs can be executed here against better-sqlite3.
 * That makes the filter semantics testable without a phone — and the LIKE
 * escaping in particular is worth proving, because getting it wrong shows up
 * as "search returns everything", which reads as a bug in the data rather
 * than in the query.
 */

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'db', 'migrations');

function makeDb() {
  const sqlite = new Database(':memory:');
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const t = stmt.trim();
      if (t) sqlite.exec(t);
    }
  }
  return drizzle(sqlite, { schema });
}

type Db = ReturnType<typeof makeDb>;

function seed(db: Db) {
  db.insert(categories)
    .values([
      { id: 1, name: 'Food & Dining', isSystem: true },
      { id: 2, name: 'Transport', isSystem: true },
      { id: 3, name: '100% Bonus', isSystem: false }, // deliberate LIKE wildcard
    ])
    .run();

  db.insert(transactions)
    .values([
      {
        id: 1,
        type: 'expense',
        amountPaise: 25000,
        date: '2026-01-15',
        note: 'Lunch at Zomato',
        categoryId: 1,
        createdAt: 'x',
        updatedAt: 'x',
      },
      {
        id: 2,
        type: 'expense',
        amountPaise: 8000,
        date: '2026-02-03',
        note: 'Auto fare',
        categoryId: 2,
        createdAt: 'x',
        updatedAt: 'x',
      },
      {
        id: 3,
        type: 'income',
        amountPaise: 5000000,
        date: '2026-02-01',
        note: 'Salary',
        categoryId: null,
        createdAt: 'x',
        updatedAt: 'x',
      },
      {
        id: 4,
        type: 'expense',
        amountPaise: 120000,
        date: '2026-03-20',
        note: '50% off sale',
        categoryId: 3,
        createdAt: 'x',
        updatedAt: 'x',
      },
      {
        id: 5,
        type: 'expense',
        amountPaise: 9900,
        date: '2026-03-21',
        note: 'deleted row',
        categoryId: 1,
        createdAt: 'x',
        updatedAt: 'x',
        deletedAt: '2026-03-22',
      },
    ])
    .run();
}

function run(db: Db, filters: TransactionFilters, today?: string): number[] {
  return db
    .select({ id: transactions.id })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(today ? buildWhere(filters, today) : buildWhere(filters))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all()
    .map((r) => r.id);
}

describe('transaction filters', () => {
  let db: Db;
  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it('excludes soft-deleted rows from every read', () => {
    const ids = run(db, {});
    expect(ids).not.toContain(5);
    expect(ids).toHaveLength(4);
  });

  it("treats type 'all' as no predicate, not a two-value IN", () => {
    expect(run(db, { type: 'all' }).sort()).toEqual([1, 2, 3, 4]);
  });

  it('filters by type', () => {
    expect(run(db, { type: 'income' })).toEqual([3]);
    expect(run(db, { type: 'expense' }).sort()).toEqual([1, 2, 4]);
  });

  it('filters by category', () => {
    expect(run(db, { categoryIds: [1] })).toEqual([1]);
    expect(run(db, { categoryIds: [1, 2] }).sort()).toEqual([1, 2]);
  });

  it('filters by date range, inclusive at both ends', () => {
    expect(run(db, { dateFrom: '2026-02-01', dateTo: '2026-02-03' }).sort()).toEqual([2, 3]);
    expect(run(db, { dateFrom: '2026-03-20', dateTo: '2026-03-20' })).toEqual([4]);
  });

  it('orders by date desc then id desc, which is a total order', () => {
    expect(run(db, {})).toEqual([4, 2, 3, 1]);
  });

  it('searches the note case-insensitively', () => {
    expect(run(db, { search: 'zomato' })).toEqual([1]);
    expect(run(db, { search: 'ZOMATO' })).toEqual([1]);
  });

  it('searches the category name, not just the note', () => {
    expect(run(db, { search: 'transport' })).toEqual([2]);
  });

  it('escapes % so it matches a literal percent, not everything', () => {
    // Without ESCAPE this returns all four rows.
    const ids = run(db, { search: '50%' });
    expect(ids).toEqual([4]);
  });

  it('escapes _ so it matches a literal underscore, not any character', () => {
    // 'A_to' would match 'Auto' if the underscore were a wildcard.
    expect(run(db, { search: 'A_to' })).toEqual([]);
    expect(run(db, { search: 'Auto' })).toEqual([2]);
  });

  it('matches a literal % in a category name', () => {
    expect(run(db, { search: '100%' })).toEqual([4]);
  });

  it('combines filters with AND', () => {
    expect(run(db, { type: 'expense', dateFrom: '2026-02-01' }).sort()).toEqual([2, 4]);
    expect(run(db, { type: 'income', dateFrom: '2026-03-01' })).toEqual([]);
  });

  it('ignores a whitespace-only search', () => {
    expect(run(db, { search: '   ' }).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('date presets resolve against today, not against when they were tapped', () => {
  let db: Db;
  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it('moves with the date — the midnight bug this replaces', () => {
    const filters: TransactionFilters = { datePreset: 'last7' };
    // Chosen at 23:50 on 20 March, the window ends that day...
    expect(resolveDateRange(filters, '2026-03-20')).toEqual({ from: '2026-03-14', to: '2026-03-20' });
    // ...and ten minutes later the SAME stored filter means the next window.
    expect(resolveDateRange(filters, '2026-03-21')).toEqual({ from: '2026-03-15', to: '2026-03-21' });

    // Which is what keeps a transaction added after midnight inside the filter
    // it was added under. Storing the resolved dates made it vanish instead.
    db.insert(transactions)
      .values({
        id: 6,
        type: 'expense',
        amountPaise: 100,
        date: '2026-03-21',
        categoryId: 1,
        createdAt: 'x',
        updatedAt: 'x',
      })
      .run();
    expect(run(db, filters, '2026-03-20')).not.toContain(6);
    expect(run(db, filters, '2026-03-21')).toContain(6);
  });

  it('resolves every preset against the given day', () => {
    expect(resolveDateRange({ datePreset: 'last30' }, '2026-03-20')).toEqual({
      from: '2026-02-19',
      to: '2026-03-20',
    });
    expect(resolveDateRange({ datePreset: 'thisMonth' }, '2026-03-20')).toEqual({
      from: '2026-03-01',
      to: '2026-03-20',
    });
    expect(resolveDateRange({ datePreset: 'last12m' }, '2026-03-20')).toEqual({
      from: '2025-03-21',
      to: '2026-03-20',
    });
  });

  it('crosses a month boundary correctly', () => {
    // 1 March looking back 7 days lands in February, leap year included.
    expect(resolveDateRange({ datePreset: 'last7' }, '2024-03-01')).toEqual({
      from: '2024-02-24',
      to: '2024-03-01',
    });
  });

  it('falls back to the explicit range when there is no preset', () => {
    expect(resolveDateRange({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }, '2026-09-16')).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(resolveDateRange({}, '2026-09-16')).toEqual({ from: undefined, to: undefined });
  });

  it('lets a preset win over stale explicit bounds, so the two can never disagree', () => {
    const mixed: TransactionFilters = { datePreset: 'thisMonth', dateFrom: '2020-01-01', dateTo: '2020-12-31' };
    expect(resolveDateRange(mixed, '2026-03-20')).toEqual({ from: '2026-03-01', to: '2026-03-20' });
  });

  it('filters rows by a preset through the real SQL', () => {
    // "This month" on 3 Feb 2026 keeps the two February rows.
    expect(run(db, { datePreset: 'thisMonth' }, '2026-02-03').sort()).toEqual([2, 3]);
    expect(run(db, { datePreset: 'thisMonth' }, '2026-01-31')).toEqual([1]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for empty or all-types filters', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ type: 'all' })).toBe(false);
    expect(hasActiveFilters({ categoryIds: [] })).toBe(false);
    expect(hasActiveFilters({ search: '  ' })).toBe(false);
  });

  it('is true once anything narrows', () => {
    expect(hasActiveFilters({ type: 'expense' })).toBe(true);
    expect(hasActiveFilters({ categoryIds: [1] })).toBe(true);
    expect(hasActiveFilters({ dateFrom: '2026-01-01' })).toBe(true);
    expect(hasActiveFilters({ datePreset: 'last7' })).toBe(true);
    expect(hasActiveFilters({ search: 'x' })).toBe(true);
  });
});

describe('summary aggregates', () => {
  /**
   * Runs the SHIPPED summary query. The old version of this test only counted
   * rows, despite its title — so swapping the income and expense CASEs, the
   * bug it was named for, could never have failed it.
   */
  it('sums income and expense separately, in SQL, ignoring deleted rows', () => {
    const db = makeDb();
    seed(db);
    const [row] = allSync<{ count: number; incomePaise: number; expensePaise: number }>(
      summaryQuery(db, { type: 'all' }),
    );
    // 4 live rows; the soft-deleted ₹99 expense must not count anywhere.
    expect(row).toEqual({ count: 4, incomePaise: 50_000_00, expensePaise: 250_00 + 80_00 + 1_200_00 });
  });

  it('applies the same filters as the ledger', () => {
    const db = makeDb();
    seed(db);
    const [row] = allSync<{ count: number; incomePaise: number; expensePaise: number }>(
      summaryQuery(db, { type: 'expense' }),
    );
    expect(row).toEqual({ count: 3, incomePaise: 0, expensePaise: 250_00 + 80_00 + 1_200_00 });
  });
});
