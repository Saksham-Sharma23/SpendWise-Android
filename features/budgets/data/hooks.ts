import { budgetSpend } from '@/data/ledger';
import { readDb } from '@/db/read';
import { useDbQuery, type DbQueryResult } from '@/lib/db/useDbQuery';
import { getCycleWindow, todayISO, type ISODate } from '@/lib/dates';
import { budgetStatus, type BudgetProgress, type BudgetRow } from '../domain/progress';
import { budgetListQuery, budgetableCategoriesQuery, takenCategoriesQuery } from './sql';

/**
 * Budgets' live reads. Screens call these and never see a table name.
 *
 * The hard part is the window. A budget resetting on the 15th runs 15 Mar →
 * 14 Apr, so "spent this budget" is NOT "spent this calendar month" — getting
 * that wrong makes every figure on the screen quietly incorrect while looking
 * entirely plausible.
 */

const EMPTY: BudgetProgress[] = [];

/**
 * Every live budget with its category and this cycle's spend. One spend
 * query for all of them: ten budgets with ten reset days still cost one pass.
 */
export function useBudgetsWithSpend(today: ISODate = todayISO()): DbQueryResult<BudgetProgress[]> {
  return useDbQuery(
    async () => {
      const rows = (await budgetListQuery(readDb)) as BudgetRow[];
      if (rows.length === 0) return EMPTY;
      const windows = rows.map((b) => getCycleWindow(b.resetDay, today));
      const spend = await budgetSpend(
        readDb,
        rows.map((b, i) => ({ categoryId: b.categoryId, start: windows[i]!.start, end: windows[i]!.end })),
      );
      const byId = new Map(spend.map((r) => [r.categoryId, r.spentPaise]));
      return rows.map((b, i) => budgetStatus(b, windows[i]!, byId.get(b.categoryId) ?? 0));
    },
    // categories: a rename or recolour changes what a budget row draws.
    ['budgets', 'transactions', 'categories'],
    [today],
    EMPTY,
  );
}

/** Categories that have no live budget yet — what the create form may offer. */
export function useBudgetableCategories(excludeBudgetId?: number) {
  return useDbQuery(
    async () => {
      const [taken, rows] = await Promise.all([takenCategoriesQuery(readDb), budgetableCategoriesQuery(readDb)]);
      const used = new Set(taken.filter((t) => t.id !== excludeBudgetId).map((t) => t.categoryId));
      return rows.filter((c) => !used.has(c.id));
    },
    ['budgets', 'categories'],
    [excludeBudgetId ?? 0],
    [],
  );
}
