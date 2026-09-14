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
