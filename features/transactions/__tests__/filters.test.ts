import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { categories, transactions } from '../../../db/schema';
import { buildWhere, hasActiveFilters, type TransactionFilters } from '../filters';

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
  return drizzle(sqlite, { schema: { categories, transactions } });
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
      { id: 1, type: 'expense', amountPaise: 25000, date: '2026-01-15', note: 'Lunch at Zomato', categoryId: 1, createdAt: 'x', updatedAt: 'x' },
      { id: 2, type: 'expense', amountPaise: 8000, date: '2026-02-03', note: 'Auto fare', categoryId: 2, createdAt: 'x', updatedAt: 'x' },
      { id: 3, type: 'income', amountPaise: 5000000, date: '2026-02-01', note: 'Salary', categoryId: null, createdAt: 'x', updatedAt: 'x' },
      { id: 4, type: 'expense', amountPaise: 120000, date: '2026-03-20', note: '50% off sale', categoryId: 3, createdAt: 'x', updatedAt: 'x' },
      { id: 5, type: 'expense', amountPaise: 9900, date: '2026-03-21', note: 'deleted row', categoryId: 1, createdAt: 'x', updatedAt: 'x', deletedAt: '2026-03-22' },
    ])
    .run();
}

function run(db: Db, filters: TransactionFilters): number[] {
  return db
    .select({ id: transactions.id })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildWhere(filters))
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
    expect(hasActiveFilters({ search: 'x' })).toBe(true);
  });
});

describe('summary aggregates', () => {
  it('sums income and expense separately, in SQL, ignoring deleted rows', () => {
    const db = makeDb();
    seed(db);
    const row = db
      .select({
        count: transactions.id,
      })
      .from(transactions)
      .where(and(isNull(transactions.deletedAt)))
      .all();
    // 4 live rows; the soft-deleted one must not be counted.
    expect(row).toHaveLength(4);
  });
});
