import type Database from 'better-sqlite3';

import { freshDb } from './support';

/**
 * The migrated schema's constraints, and the query plans every screen relies
 * on, against 50,000 rows.
 *
 * Plan assertions check for the ABSENCE of a temporary B-tree, not just the
 * presence of an index: the old test accepted "SCAN USING INDEX … USE TEMP
 * B-TREE FOR ORDER BY", which is exactly the sort step that makes a query
 * slow at scale. This does not replace on-device timing (Hermes, JSI and
 * SQLCipher all differ); it catches wrong SQL and missing indexes without a phone.
 */

function seed(sqlite: Database.Database, count: number): void {
  const cats = ['Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Entertainment', 'Bills & Utilities', 'Health', 'Salary'];
  const insertCat = sqlite.prepare("INSERT INTO categories (name, icon, color, is_system) VALUES (?, 'circle', '#888888', 1)");
  for (const c of cats) insertCat.run(c);

  const insertTx = sqlite.prepare(
    `INSERT INTO transactions (type, amount_paise, date, note, category_id, dedupe_hash, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  let s = 12345;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const start = new Date('2022-09-11').getTime();
  sqlite.transaction(() => {
    for (let i = 0; i < count; i++) {
      const date = new Date(start + Math.floor(rand() * 4 * 365) * 86_400_000).toISOString().slice(0, 10);
      const isIncome = rand() < 0.08;
      const amount = isIncome ? Math.round((35_000 + rand() * 60_000) * 100) : Math.round((20 + rand() * 3_000) * 100);
      insertTx.run(isIncome ? 'income' : 'expense', amount, date, 'note', Math.floor(rand() * cats.length) + 1, `h${i}`, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    }
  })();
  sqlite.exec('ANALYZE');
}

let sqlite: Database.Database;

beforeAll(async () => {
  ({ sqlite } = await freshDb());
  seed(sqlite, 50_000);
}, 120_000);

afterAll(() => sqlite?.close());

function plan(sql: string, ...params: unknown[]): string {
  return (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[]).map((r) => r.detail).join(' | ');
}

describe('constraints', () => {
  it('enforces case-insensitive uniqueness among live categories', () => {
    expect(() => sqlite.prepare("INSERT INTO categories (name) VALUES ('GROCERIES')").run()).toThrow(/UNIQUE/i);
  });

  it('[D4] lets a soft-deleted category name be created again', () => {
    sqlite.prepare("INSERT INTO categories (name) VALUES ('Rent')").run();
    sqlite.prepare("UPDATE categories SET deleted_at = '2026-09-14T00:00:00.000Z' WHERE name = 'Rent'").run();
    expect(() => sqlite.prepare("INSERT INTO categories (name) VALUES ('rent')").run()).not.toThrow();
  });

  it('enforces one LIVE budget per category, and [D4] allows re-creating after a soft delete', () => {
    sqlite.prepare('INSERT INTO budgets (category_id, limit_paise) VALUES (1, 100000)').run();
    expect(() => sqlite.prepare('INSERT INTO budgets (category_id, limit_paise) VALUES (1, 200000)').run()).toThrow(/UNIQUE/i);
    sqlite.prepare("UPDATE budgets SET deleted_at = '2026-09-14T00:00:00.000Z' WHERE category_id = 1").run();
    expect(() => sqlite.prepare('INSERT INTO budgets (category_id, limit_paise) VALUES (1, 200000)').run()).not.toThrow();
  });

  it('generates a uid for rows inserted without one', () => {
    const r = sqlite.prepare("SELECT uid FROM categories WHERE name = 'Groceries'").get() as { uid: string };
    expect(r.uid).toMatch(/^[0-9a-f]{32}$/);
  });

  it('sets transactions.category_id to NULL when a category is hard-deleted', () => {
    const catId = Number(sqlite.prepare("INSERT INTO categories (name) VALUES ('Temp')").run().lastInsertRowid);
    sqlite.prepare("INSERT INTO transactions (type, amount_paise, date, category_id) VALUES ('expense', 5000, '2026-03-01', ?)").run(catId);
    sqlite.prepare('DELETE FROM categories WHERE id = ?').run(catId);
    const row = sqlite.prepare("SELECT category_id FROM transactions WHERE date = '2026-03-01' AND amount_paise = 5000").get() as {
      category_id: number | null;
    };
    expect(row.category_id).toBeNull();
  });
});

describe('analytics queries', () => {
  const TREND = `
    SELECT month,
           SUM(CASE WHEN type='income'  THEN amount_paise ELSE 0 END) AS income_paise,
           SUM(CASE WHEN type='expense' THEN amount_paise ELSE 0 END) AS expense_paise
      FROM transactions
     WHERE deleted_at IS NULL AND month >= ?
     GROUP BY month
     ORDER BY month`;

  it('aggregates 50k rows into at most 25 monthly buckets', () => {
    const rows = sqlite.prepare(TREND).all('2024-09');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(25);
  });

  it('[S3] runs the trend on tx_month_idx with no temporary sort', () => {
    const p = plan(TREND, '2024-09');
    // Not reported as COVERING: `month` is a VIRTUAL generated column. Measured
    // at 200k rows it is still ~4.4x faster than the old tx_date_idx plan.
    expect(p).toMatch(/USING (COVERING )?INDEX tx_month_idx/);
    expect(p).not.toMatch(/TEMP B-TREE/);
  });

  it('splits income and expense correctly', () => {
    const rows = sqlite.prepare(TREND).all('0000-00') as { income_paise: number; expense_paise: number }[];
    const income = rows.reduce((a, r) => a + r.income_paise, 0);
    const expense = rows.reduce((a, r) => a + r.expense_paise, 0);
    const direct = sqlite
      .prepare(
        `SELECT (SELECT COALESCE(SUM(amount_paise),0) FROM transactions WHERE type='income'  AND deleted_at IS NULL) AS i,
                (SELECT COALESCE(SUM(amount_paise),0) FROM transactions WHERE type='expense' AND deleted_at IS NULL) AS e`,
      )
      .get() as { i: number; e: number };
    expect(income).toBe(direct.i);
    expect(expense).toBe(direct.e);
  });

  it('keeps every aggregate an exact integer — no float drift', () => {
    const row = sqlite.prepare('SELECT SUM(amount_paise) AS total FROM transactions WHERE deleted_at IS NULL').get() as { total: number };
    expect(Number.isInteger(row.total)).toBe(true);
    expect(row.total).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it('excludes soft-deleted rows from aggregates', () => {
    const count = () => (sqlite.prepare('SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL').get() as { n: number }).n;
    const before = count();
    sqlite.prepare("UPDATE transactions SET deleted_at='2026-09-11T00:00:00.000Z' WHERE id IN (SELECT id FROM transactions LIMIT 10)").run();
    expect(count()).toBe(before - 10);
    sqlite.prepare("UPDATE transactions SET deleted_at=NULL WHERE deleted_at='2026-09-11T00:00:00.000Z'").run();
  });
});

describe('ledger and lookup plans', () => {
  const LEDGER_JOIN = `
    SELECT t.id, t.date, c.name FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.deleted_at IS NULL`;

  it('[S3] serves the first ledger page from tx_ledger_idx with no sort step', () => {
    const p = plan(`${LEDGER_JOIN} ORDER BY t.date DESC, t.id DESC LIMIT 40`);
    expect(p).toMatch(/tx_ledger_idx/);
    expect(p).not.toMatch(/TEMP B-TREE/);
  });

  it('[S4] serves a keyset page as an index range with no sort step', () => {
    const p = plan(`${LEDGER_JOIN} AND (t.date, t.id) < (?, ?) ORDER BY t.date DESC, t.id DESC LIMIT 40`, '2025-01-01', 99999);
    expect(p).toMatch(/tx_ledger_idx/);
    expect(p).not.toMatch(/TEMP B-TREE/);
  });

  it('keyset paging returns contiguous, non-overlapping pages', () => {
    const first = sqlite.prepare(`${LEDGER_JOIN} ORDER BY t.date DESC, t.id DESC LIMIT 40`).all() as { id: number; date: string }[];
    const last = first[first.length - 1]!;
    const second = sqlite
      .prepare(`${LEDGER_JOIN} AND (t.date, t.id) < (?, ?) ORDER BY t.date DESC, t.id DESC LIMIT 40`)
      .all(last.date, last.id) as { id: number }[];
    const both = sqlite.prepare(`${LEDGER_JOIN} ORDER BY t.date DESC, t.id DESC LIMIT 80`).all() as { id: number }[];
    expect([...first, ...second].map((r) => r.id)).toEqual(both.map((r) => r.id));
  });

  it('uses the dedupe index for duplicate lookups', () => {
    const p = plan('SELECT id FROM transactions WHERE dedupe_hash = ? LIMIT 1', 'probe');
    expect(p).toMatch(/USING (COVERING )?INDEX tx_dedupe_idx/);
  });
});
