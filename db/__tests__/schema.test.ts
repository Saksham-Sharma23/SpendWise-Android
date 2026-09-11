import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Applies the REAL generated migration and runs the REAL analytics queries
 * against a populated database, in Node.
 *
 * This does not replace on-device timing — Hermes, the JSI bridge and phone
 * storage all differ, and the Phase 1 exit criterion is still a device
 * measurement. What it does prove, without any hardware:
 *
 *   - the generated SQL applies cleanly from scratch
 *   - every constraint and index is actually created
 *   - the analytics queries are syntactically valid and return correct
 *     results, not just plausible ones
 *   - each query uses an index rather than scanning, which is the property
 *     that determines whether it stays fast as the ledger grows
 *
 * A query that is fast on a phone today but scanning will not stay fast at
 * 200k rows, so the plan assertions matter more than the timings here.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

function applyMigrations(db: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  expect(files.length).toBeGreaterThan(0);

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    // drizzle-kit separates statements with this marker.
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed) db.exec(trimmed);
    }
  }
}

function seed(db: Database.Database, count: number): void {
  const cats = [
    'Food & Dining', 'Groceries', 'Transport', 'Shopping',
    'Entertainment', 'Bills & Utilities', 'Health', 'Salary',
  ];
  const insertCat = db.prepare(
    'INSERT INTO categories (name, icon, color, is_system, created_at) VALUES (?,?,?,1,?)',
  );
  for (const c of cats) insertCat.run(c, 'circle', '#888888', '2026-01-01');

  const insertTx = db.prepare(
    `INSERT INTO transactions
       (type, amount_paise, date, note, category_id, is_recurring, dedupe_hash, created_at, updated_at)
     VALUES (?,?,?,?,?,0,?,?,?)`,
  );

  // Deterministic PRNG so failures are reproducible.
  let s = 12345;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const start = new Date('2022-09-11').getTime();
  const spanDays = 4 * 365;

  const run = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const day = Math.floor(rand() * spanDays);
      const date = new Date(start + day * 86_400_000).toISOString().slice(0, 10);
      const isIncome = rand() < 0.08;
      const amount = isIncome
        ? Math.round((35_000 + rand() * 60_000) * 100)
        : Math.round((20 + rand() * 3_000) * 100);
      insertTx.run(
        isIncome ? 'income' : 'expense',
        amount,
        date,
        'note',
        Math.floor(rand() * cats.length) + 1,
        `h${i}`,
        '2026-01-01',
        '2026-01-01',
      );
    }
  });
  run();
  db.exec('ANALYZE');
}

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  seed(db, 50_000);
});

afterAll(() => db?.close());

describe('generated migration', () => {
  it('creates every table', () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name)
      .filter((n) => !n.startsWith('sqlite_'));

    expect(names).toEqual(
      expect.arrayContaining([
        'app_meta', 'budgets', 'categories',
        'import_batches', 'subscriptions', 'transactions',
      ]),
    );
  });

  it('creates every index the analytics queries depend on', () => {
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r) => (r as { name: string }).name);

    expect(idx).toEqual(
      expect.arrayContaining([
        'tx_date_idx', 'tx_cat_idx', 'tx_batch_idx', 'tx_dedupe_idx',
        'budget_cat_unique', 'cat_name_unique', 'sub_status_idx',
      ]),
    );
  });

  it('enforces case-insensitive category uniqueness', () => {
    // The importer will otherwise create "Food" alongside "food".
    expect(() =>
      db
        .prepare('INSERT INTO categories (name, created_at) VALUES (?,?)')
        .run('GROCERIES', '2026-01-01'),
    ).toThrow(/UNIQUE/i);
  });

  it('enforces one budget per category', () => {
    db.prepare(
      'INSERT INTO budgets (category_id, limit_paise, reset_day, is_active, created_at) VALUES (1,100000,1,1,?)',
    ).run('2026-01-01');
    expect(() =>
      db
        .prepare(
          'INSERT INTO budgets (category_id, limit_paise, reset_day, is_active, created_at) VALUES (1,200000,1,1,?)',
        )
        .run('2026-01-01'),
    ).toThrow(/UNIQUE/i);
  });

  it('sets transactions.category_id to NULL when a category is deleted', () => {
    db.prepare('INSERT INTO categories (name, created_at) VALUES (?,?)').run(
      'Temp',
      '2026-01-01',
    );
    const catId = (db.prepare('SELECT id FROM categories WHERE name=?').get('Temp') as { id: number }).id;
    db.prepare(
      `INSERT INTO transactions (type, amount_paise, date, category_id, is_recurring, created_at, updated_at)
       VALUES ('expense', 5000, '2026-03-01', ?, 0, '2026-01-01','2026-01-01')`,
    ).run(catId);

    db.prepare('DELETE FROM categories WHERE id=?').run(catId);

    const orphan = db
      .prepare('SELECT category_id FROM transactions WHERE date=? AND amount_paise=5000')
      .get('2026-03-01') as { category_id: number | null };
    expect(orphan.category_id).toBeNull();
  });
});

describe('analytics queries', () => {
  const TREND = `
    SELECT substr(date,1,7) AS month,
           SUM(CASE WHEN type='income'  THEN amount_paise ELSE 0 END) AS income_paise,
           SUM(CASE WHEN type='expense' THEN amount_paise ELSE 0 END) AS expense_paise
      FROM transactions
     WHERE deleted_at IS NULL AND date >= ?
     GROUP BY month
     ORDER BY month`;

  it('aggregates 50k rows into at most 25 monthly buckets', () => {
    const rows = db.prepare(TREND).all('2024-09-11');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(25);
  });

  it('uses an index for the trend query rather than scanning', () => {
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN ${TREND}`)
      .all('2024-09-11')
      .map((r) => (r as { detail: string }).detail)
      .join(' | ');
    expect(plan).toMatch(/USING (COVERING )?INDEX/i);
  });

  it('splits income and expense correctly', () => {
    const rows = db.prepare(TREND).all('2022-01-01') as Array<{
      income_paise: number;
      expense_paise: number;
    }>;
    const income = rows.reduce((a, r) => a + r.income_paise, 0);
    const expense = rows.reduce((a, r) => a + r.expense_paise, 0);

    const direct = db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(amount_paise),0) FROM transactions WHERE type='income'  AND deleted_at IS NULL) AS i,
           (SELECT COALESCE(SUM(amount_paise),0) FROM transactions WHERE type='expense' AND deleted_at IS NULL) AS e`,
      )
      .get() as { i: number; e: number };

    expect(income).toBe(direct.i);
    expect(expense).toBe(direct.e);
  });

  it('keeps every aggregate an exact integer — no float drift', () => {
    const row = db
      .prepare('SELECT SUM(amount_paise) AS total FROM transactions WHERE deleted_at IS NULL')
      .get() as { total: number };
    expect(Number.isInteger(row.total)).toBe(true);
    expect(row.total).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it('excludes soft-deleted rows from aggregates', () => {
    const before = (
      db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL').get() as { n: number }
    ).n;
    db.prepare("UPDATE transactions SET deleted_at='2026-09-11' WHERE id IN (SELECT id FROM transactions LIMIT 10)").run();
    const after = (
      db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL').get() as { n: number }
    ).n;
    expect(after).toBe(before - 10);
    db.prepare("UPDATE transactions SET deleted_at=NULL WHERE deleted_at='2026-09-11'").run();
  });

  it('uses an index for the ledger page and the dedupe lookup', () => {
    const ledger = db
      .prepare(
        'EXPLAIN QUERY PLAN SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY date DESC, id DESC LIMIT 50',
      )
      .all()
      .map((r) => (r as { detail: string }).detail)
      .join(' | ');
    expect(ledger).toMatch(/USING (COVERING )?INDEX/i);

    const dedupe = db
      .prepare('EXPLAIN QUERY PLAN SELECT id FROM transactions WHERE dedupe_hash = ? LIMIT 1')
      .all('probe')
      .map((r) => (r as { detail: string }).detail)
      .join(' | ');
    expect(dedupe).toMatch(/USING (COVERING )?INDEX/i);
    expect(dedupe).not.toMatch(/SCAN transactions(?! USING)/i);
  });
});
