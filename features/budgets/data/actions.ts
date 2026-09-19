import { budgetSpend } from '@/data/ledger';
import { db } from '@/db/client';
import { allSync } from '@/db/types';
import { safeWrite, type WriteResult } from '@/lib/db/safeWrite';
import { getCycleWindow, todayISO, type ISODate } from '@/lib/dates';
import { budgetStatus, type BudgetProgress, type BudgetRow } from '../domain/progress';
import { budgetForCategoryQuery, budgetForEditQuery } from './sql';
import { changeBudget, insertBudget, retireBudget, unretireBudget, type BudgetInput } from './writes';

/**
 * What screens call to change budgets. Each write is bound to the app's
 * handle and wrapped in safeWrite, which toasts a failure and returns
 * `{ ok: false }` so a form can stay open (CLAUDE.md #9).
 */

export function createBudget(input: BudgetInput): WriteResult<number> {
  return safeWrite('save the budget', () => insertBudget(db, input));
}

export function updateBudget(id: number, input: BudgetInput): WriteResult<void> {
  return safeWrite('save the changes', () => changeBudget(db, id, input));
}

export function softDeleteBudget(id: number): WriteResult<void> {
  return safeWrite('delete the budget', () => retireBudget(db, id));
}

export function restoreBudget(id: number): WriteResult<void> {
  return safeWrite('restore the budget', () => unretireBudget(db, id));
}

/** One budget for the edit form — a point read, so it uses the sync handle. */
export function getBudget(id: number) {
  return allSync<{ id: number; categoryId: number; limitPaise: number; resetDay: number; isActive: boolean }>(
    budgetForEditQuery(db, id),
  )[0];
}

/**
 * The budget on a just-written transaction's category, for Phase 8's
 * 75%/100% alerts. It uses the SAME spend query as the screen, so the alert
 * and the bar cannot disagree.
 */
export function budgetProgressForCategory(categoryId: number, today: ISODate = todayISO()): BudgetProgress | null {
  const budget = allSync<BudgetRow>(budgetForCategoryQuery(db, categoryId))[0];
  if (!budget) return null;
  const window = getCycleWindow(budget.resetDay, today);
  const spent = allSync<{ spentPaise: number }>(
    budgetSpend(db, [{ categoryId, start: window.start, end: window.end }]),
  )[0];
  return budgetStatus(budget, window, spent?.spentPaise ?? 0);
}
