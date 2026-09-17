import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import * as schema from '../../../db/schema';
import {
  CategoryError,
  createCategory,
  deleteCategory,
  mergeCategory,
  normalizeCategoryName,
  tombstoneName,
  updateCategory,
  type SyncDb,
} from '../mutations';

/**
 * Category writes against the REAL generated migration, so the two unique
 * indexes that make merge and delete subtle (lower(name) and budget
 * category_id, both including soft-deleted rows) are genuinely in force.
 */

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'db', 'migrations');

function freshDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    for (const stmt of readFileSync(join(MIGRATIONS_DIR, f), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) sqlite.exec(stmt);
    }
  }
  const db = drizzle(sqlite, { schema }) as unknown as SyncDb;
  return { sqlite, db };
}

function addSystem(sqlite: Database.Database, name: string): number {
  return Number(
    sqlite
      .prepare("INSERT INTO categories (name, icon, color, is_system, created_at) VALUES (?, 'tag', '#888888', 1, '2026-01-01')")
      .run(name).lastInsertRowid,
  );
}

function addTx(sqlite: Database.Database, categoryId: number | null, deleted = false): number {
  return Number(
    sqlite
      .prepare(
        `INSERT INTO transactions (type, amount_paise, date, category_id, created_at, updated_at, deleted_at)
         VALUES ('expense', 1000, '2026-09-01', ?, 'now', 'now', ?)`,
      )
      .run(categoryId, deleted ? '2026-09-02' : null).lastInsertRowid,
  );
}

function addBudget(sqlite: Database.Database, categoryId: number, deleted = false): number {
  return Number(
    sqlite
      .prepare("INSERT INTO budgets (category_id, limit_paise, reset_day, is_active, created_at, deleted_at) VALUES (?, 500000, 1, 1, 'now', ?)")
      .run(categoryId, deleted ? '2026-09-02' : null).lastInsertRowid,
  );
}

const input = (name: string) => ({ name, color: '#E8833A', icon: 'coffee' });

describe('names', () => {
  it('normalises whitespace', () => {
    expect(normalizeCategoryName('  Food   out ')).toBe('Food out');
  });

  it('builds tombstones that cannot clash with a real name', () => {
    expect(tombstoneName('Food', 7)).toBe('Food ⟨deleted #7⟩');
  });
});

describe('createCategory / updateCategory', () => {
  it('creates, and rejects a case-insensitive duplicate with a friendly error', () => {
    const { db } = freshDb();
    createCategory(db, input('Coffee'));
    expect(() => createCategory(db, input('  coffee '))).toThrow(CategoryError);
    expect(() => createCategory(db, input('coffee'))).toThrow('already exists');
  });

  it('rejects empty and over-long names', () => {
    const { db } = freshDb();
    expect(() => createCategory(db, input('   '))).toThrow('Give the category a name');
    expect(() => createCategory(db, input('x'.repeat(41)))).toThrow('under 40');
  });

  it('renames and recolours, allowing a change of case on itself', () => {
    const { sqlite, db } = freshDb();
    const id = createCategory(db, input('coffee'));
    updateCategory(db, id, { name: 'Coffee', color: '#3A7CA5', icon: 'pizza' });
    const row = sqlite.prepare('SELECT name, color, icon FROM categories WHERE id = ?').get(id);
    expect(row).toEqual({ name: 'Coffee', color: '#3A7CA5', icon: 'pizza' });
  });

  it('refuses to rename onto another category', () => {
    const { db } = freshDb();
    createCategory(db, input('Coffee'));
    const tea = createCategory(db, input('Tea'));
    expect(() => updateCategory(db, tea, input('COFFEE'))).toThrow('already exists');
  });
});

describe('deleteCategory', () => {
  it('uncategorises transactions, retires the budget, and frees the name', () => {
    const { sqlite, db } = freshDb();
    const id = createCategory(db, input('Snacks'));
    addTx(sqlite, id);
    addTx(sqlite, id);
    addBudget(sqlite, id);

    expect(deleteCategory(db, id)).toEqual({ uncategorised: 2 });

    expect(sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE category_id IS NULL').get()).toEqual({ n: 2 });
    expect(sqlite.prepare('SELECT deleted_at IS NOT NULL AS d FROM budgets').get()).toEqual({ d: 1 });
    // The name is free again despite the unique index covering deleted rows.
    expect(() => createCategory(db, input('Snacks'))).not.toThrow();
  });

  it('protects built-in categories', () => {
    const { sqlite, db } = freshDb();
    const id = addSystem(sqlite, 'Groceries');
    expect(() => deleteCategory(db, id)).toThrow('cannot be deleted');
  });
});

describe('mergeCategory', () => {
  it('moves live AND soft-deleted transactions, so a later undo stays categorised', () => {
    const { sqlite, db } = freshDb();
    const target = addSystem(sqlite, 'Food & Dining');
    const source = createCategory(db, input('food'.toUpperCase() + ' out'));
    addTx(sqlite, source);
    const deletedTx = addTx(sqlite, source, true);

    expect(mergeCategory(db, source, target)).toEqual({ moved: 1 });

    const cat = sqlite.prepare('SELECT category_id AS c FROM transactions WHERE id = ?').get(deletedTx) as { c: number };
    expect(cat.c).toBe(target);
    expect(sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE category_id = ?').get(target)).toEqual({ n: 2 });
    expect(sqlite.prepare('SELECT deleted_at IS NOT NULL AS d FROM categories WHERE id = ?').get(source)).toEqual({ d: 1 });
  });

  it("keeps the target's own budget and retires the source's", () => {
    const { sqlite, db } = freshDb();
    const target = createCategory(db, input('Food'));
    const source = createCategory(db, input('Food 2'));
    const targetBudget = addBudget(sqlite, target);
    const sourceBudget = addBudget(sqlite, source);

    mergeCategory(db, source, target);

    expect(sqlite.prepare('SELECT deleted_at IS NULL AS live FROM budgets WHERE id = ?').get(targetBudget)).toEqual({ live: 1 });
    expect(sqlite.prepare('SELECT deleted_at IS NULL AS live FROM budgets WHERE id = ?').get(sourceBudget)).toEqual({ live: 0 });
  });

  it("moves the source's budget when the target only has a deleted one (unique index)", () => {
    const { sqlite, db } = freshDb();
    const target = createCategory(db, input('Food'));
    const source = createCategory(db, input('Food 2'));
    addBudget(sqlite, target, true);
    const sourceBudget = addBudget(sqlite, source);

    expect(() => mergeCategory(db, source, target)).not.toThrow();
    expect(sqlite.prepare('SELECT category_id AS c, deleted_at IS NULL AS live FROM budgets WHERE id = ?').get(sourceBudget)).toEqual({
      c: target,
      live: 1,
    });
  });

  it('refuses merging a built-in category away, or into itself', () => {
    const { sqlite, db } = freshDb();
    const sys = addSystem(sqlite, 'Salary');
    const mine = createCategory(db, input('Bonus'));
    expect(() => mergeCategory(db, sys, mine)).toThrow('not merged away');
    expect(() => mergeCategory(db, mine, mine)).toThrow('different category');
  });

  it('is all-or-nothing', () => {
    const { sqlite, db } = freshDb();
    const target = createCategory(db, input('Food'));
    const source = createCategory(db, input('Food 2'));
    addTx(sqlite, source);
    // Force the final step to fail: a trigger rejects retiring the source.
    sqlite.exec(`CREATE TRIGGER no_retire BEFORE UPDATE OF deleted_at ON categories
                 BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
    expect(() => mergeCategory(db, source, target)).toThrow();
    expect(sqlite.prepare('SELECT count(*) AS n FROM transactions WHERE category_id = ?').get(source)).toEqual({ n: 1 });
  });
});

// ---------------------------------------------------------------------------
// B4 — every table with a category_id must be handled (CLAUDE.md #11)
// ---------------------------------------------------------------------------

function addGroupExpense(sqlite: Database.Database, categoryId: number | null): number {
  // The self person is seeded by custom migration 0008, so it already exists.
  sqlite
    .prepare("INSERT INTO split_groups (uid, name, icon, simplify_debts, created_at) VALUES ('g1', 'Goa', 'plane', 1, 'now')")
    .run();
  return Number(
    sqlite
      .prepare(
        `INSERT INTO split_expenses (uid, group_id, description, amount_paise, date, split_method, category_id, created_at)
         VALUES ('e1', 1, 'Hotel', 600000, '2026-09-01', 'equal', ?, 'now')`,
      )
      .run(categoryId).lastInsertRowid,
  );
}

const categoryOf = (sqlite: Database.Database, id: number) =>
  (sqlite.prepare('SELECT category_id AS c FROM split_expenses WHERE id = ?').get(id) as { c: number | null }).c;

describe('group expenses follow merge and delete (B4)', () => {
  it('delete makes a group expense uncategorised instead of pointing at a tombstone', () => {
    const { sqlite, db } = freshDb();
    const food = createCategory(db, input('Food'));
    const expense = addGroupExpense(sqlite, food);

    deleteCategory(db, food);

    // Before the fix this stayed = food, and groupCategoryQuery — which joins
    // categories without filtering deleted_at — rendered "Food ⟨deleted #N⟩"
    // in the group's totals.
    expect(categoryOf(sqlite, expense)).toBeNull();
  });

  it('merge moves a group expense to the target category', () => {
    const { sqlite, db } = freshDb();
    const target = createCategory(db, input('Food'));
    const source = createCategory(db, input('Food & Dining'));
    const expense = addGroupExpense(sqlite, source);

    mergeCategory(db, source, target);

    expect(categoryOf(sqlite, expense)).toBe(target);
  });

  /**
   * The guard that makes convention #11 enforceable instead of remembered.
   *
   * B4 happened because Groups was built after this file and nobody revisited
   * merge/delete. Adding another table with a category_id would repeat it — so
   * this test reads the schema itself and fails until the new table is listed
   * here AND handled in both functions above.
   */
  it('knows every table that references a category', () => {
    const { sqlite } = freshDb();
    const tables = (
      sqlite
        .prepare(
          `SELECT m.name AS t FROM sqlite_master m, pragma_table_info(m.name) p
           WHERE m.type = 'table' AND p.name = 'category_id' ORDER BY m.name`,
        )
        .all() as { t: string }[]
    ).map((r) => r.t);

    expect(tables).toEqual(['budgets', 'split_expenses', 'subscriptions', 'transactions']);
  });
});

// ---------------------------------------------------------------------------
// B15 — merge must not hard-delete budget history
// ---------------------------------------------------------------------------

describe('merge keeps soft-deleted budgets (B15)', () => {
  it('does not delete the target‘s soft-deleted budgets when moving one in', () => {
    const { sqlite, db } = freshDb();
    const target = createCategory(db, input('Food'));
    const source = createCategory(db, input('Food 2'));
    const oldTargetBudget = addBudget(sqlite, target, true); // soft-deleted
    const sourceBudget = addBudget(sqlite, source); // live

    mergeCategory(db, source, target);

    // The history survives: budget_cat_unique is partial (live rows only), so
    // it never held the slot the old hard delete was clearing.
    const rows = sqlite
      .prepare('SELECT id, category_id AS c, deleted_at AS d FROM budgets ORDER BY id')
      .all() as { id: number; c: number; d: string | null }[];
    expect(rows).toHaveLength(2);

    const kept = rows.find((r) => r.id === oldTargetBudget)!;
    expect(kept.d).not.toBeNull();

    const moved = rows.find((r) => r.id === sourceBudget)!;
    expect(moved.c).toBe(target);
    expect(moved.d).toBeNull();
  });

  it('still leaves exactly one live budget on the target', () => {
    const { sqlite, db } = freshDb();
    const target = createCategory(db, input('Food'));
    const source = createCategory(db, input('Food 2'));
    addBudget(sqlite, target, true);
    addBudget(sqlite, source);

    mergeCategory(db, source, target);

    const live = sqlite
      .prepare('SELECT count(*) AS n FROM budgets WHERE category_id = ? AND deleted_at IS NULL')
      .get(target) as { n: number };
    expect(live.n).toBe(1);
  });
});
