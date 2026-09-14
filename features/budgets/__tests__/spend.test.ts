import Database from 'better-sqlite3';

import { freshDb } from '../../../db/__tests__/support';
import { getCycleWindow } from '../../../lib/dates';

/**
 * The cycle-window SQL, against the REAL migrated schema.
 *
 * `progress.test.ts` proves the arithmetic; this proves the query that feeds
 * it — specifically that budgets with DIFFERENT reset days each get their own
 * window out of one pass, which is the part that would silently produce
 * plausible-but-wrong figures.
 *
 * The SQL mirrors budgetQueries.spend. It is written out here because the
 * shipped builder speaks to expo-sqlite through readDb, which does not exist
 * in Node.
 */

interface Key {
  categoryId: number;
  start: string;
  end: string;
}

function spendByCategory(sqlite: Database.Database, keys: Key[]) {
  const clauses = keys.map(() => '(category_id = ? and date >= ? and date <= ?)').join(' or ');
  const params = keys.flatMap((k) => [k.categoryId, k.start, k.end]);
  return sqlite
    .prepare(
      `SELECT category_id AS categoryId, coalesce(sum(amount_paise), 0) AS spentPaise
         FROM transactions
        WHERE deleted_at IS NULL AND type = 'expense' AND (${clauses})
        GROUP BY category_id`,
    )
    .all(...params) as { categoryId: number; spentPaise: number }[];
}

async function setup() {
  const { sqlite } = await freshDb();
  const cat = (name: string) =>
    Number(
      sqlite
        .prepare("INSERT INTO categories (name, icon, color, created_at) VALUES (?, 'tag', '#888888', '2026-01-01')")
        .run(name).lastInsertRowid,
    );
  const tx = (categoryId: number | null, date: string, paise: number, type = 'expense', deleted = false) =>
    sqlite
      .prepare(
        `INSERT INTO transactions (type, amount_paise, date, category_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, 'now', 'now', ?)`,
      )
      .run(type, paise, date, categoryId, deleted ? '2026-09-20' : null);
  return { sqlite, cat, tx };
}

describe('budget spend SQL', () => {
  it('gives each budget its own window in a single pass', async () => {
    const { sqlite, cat, tx } = await setup();
    const food = cat('Food');
    const travel = cat('Travel');

    // Food resets on the 1st: its cycle is 1–30 Sep.
    // Travel resets on the 15th: its cycle is 15 Sep – 14 Oct.
    tx(food, '2026-09-02', 100_00);
    tx(food, '2026-09-20', 50_00);
    tx(food, '2026-08-31', 999_00); // before Food's cycle
    tx(travel, '2026-09-10', 700_00); // before Travel's cycle, but inside Food's
    tx(travel, '2026-09-16', 200_00);
    tx(travel, '2026-10-10', 300_00); // inside Travel's cycle, next calendar month

    const today = '2026-09-20';
    const rows = spendByCategory(sqlite, [
      { categoryId: food, ...pick(getCycleWindow(1, today)) },
      { categoryId: travel, ...pick(getCycleWindow(15, today)) },
    ]);

    const byId = new Map(rows.map((r) => [r.categoryId, r.spentPaise]));
    expect(byId.get(food)).toBe(150_00);
    // 200 + 300: the October row counts, the 10 Sep one does not.
    expect(byId.get(travel)).toBe(500_00);
    sqlite.close();
  });

  it('ignores income and soft-deleted rows', async () => {
    const { sqlite, cat, tx } = await setup();
    const food = cat('Food');
    tx(food, '2026-09-02', 100_00);
    tx(food, '2026-09-03', 900_00, 'income');
    tx(food, '2026-09-04', 400_00, 'expense', true);

    const rows = spendByCategory(sqlite, [{ categoryId: food, ...pick(getCycleWindow(1, '2026-09-20')) }]);
    expect(rows[0]?.spentPaise).toBe(100_00);
    sqlite.close();
  });

  it('returns no row for a budget with no spending, rather than failing', async () => {
    const { sqlite, cat } = await setup();
    const food = cat('Food');
    const rows = spendByCategory(sqlite, [{ categoryId: food, ...pick(getCycleWindow(1, '2026-09-20')) }]);
    expect(rows).toEqual([]);
    sqlite.close();
  });

  it('enforces one LIVE budget per category, but allows re-creating a deleted one', async () => {
    const { sqlite, cat } = await setup();
    const food = cat('Food');
    const insert = (deletedAt: string | null) =>
      sqlite
        .prepare(
          "INSERT INTO budgets (category_id, limit_paise, reset_day, is_active, created_at, deleted_at) VALUES (?, 500000, 1, 1, 'now', ?)",
        )
        .run(food, deletedAt);

    insert(null);
    expect(() => insert(null)).toThrow(/UNIQUE/i);

    // Soft-delete it, then a new budget for the same category is fine.
    sqlite.prepare("UPDATE budgets SET deleted_at = '2026-09-20' WHERE category_id = ?").run(food);
    expect(() => insert(null)).not.toThrow();
    sqlite.close();
  });
});

/** The two window bounds the query binds. */
function pick(w: { start: string; end: string }) {
  return { start: w.start, end: w.end };
}
