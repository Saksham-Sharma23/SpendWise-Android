import { eq } from 'drizzle-orm';

import { budgets } from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { nowISO } from '@/lib/dates';

/**
 * Budgets' write cores. They take a sync `db`, so tests run them on
 * better-sqlite3; screens call ./actions.ts, which binds them to the app's
 * handle and reports failure through safeWrite.
 */

export interface BudgetInput {
  categoryId: number;
  /** Integer paise — the form parses the typed string, never a float. */
  limitPaise: number;
  /** 1–31. 31 means "last day of the month" in shorter months (getCycleWindow clamps). */
  resetDay: number;
  isActive?: boolean;
}

export function insertBudget(db: SyncDb, input: BudgetInput): number {
  const rows = db
    .insert(budgets)
    .values({
      categoryId: input.categoryId,
      limitPaise: input.limitPaise,
      resetDay: input.resetDay,
      isActive: input.isActive ?? true,
    })
    .returning({ id: budgets.id })
    .all();
  return rows[0]!.id;
}

export function changeBudget(db: SyncDb, id: number, input: BudgetInput): void {
  db.update(budgets)
    .set({
      categoryId: input.categoryId,
      limitPaise: input.limitPaise,
      resetDay: input.resetDay,
      isActive: input.isActive ?? true,
    })
    .where(eq(budgets.id, id))
    .run();
}

/** Soft delete, so the undo toast can put it back (CLAUDE.md #10). */
export function retireBudget(db: SyncDb, id: number): void {
  db.update(budgets).set({ deletedAt: nowISO() }).where(eq(budgets.id, id)).run();
}

/**
 * Undo a delete. The partial unique index allows one LIVE budget per
 * category, so this can clash with a budget created since; the caller's
 * safeWrite turns that into a toast rather than a crash.
 */
export function unretireBudget(db: SyncDb, id: number): void {
  db.update(budgets).set({ deletedAt: null }).where(eq(budgets.id, id)).run();
}
