import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';

import { db } from '../../db/client';
import { readDb } from '../../db/read';
import { budgets, categories, transactions } from '../../db/schema';
import { safeWrite, type WriteResult } from '../../lib/db/safeWrite';
import { useDbQuery, type DbQueryResult } from '../../lib/db/useDbQuery';
import { getCycleWindow, nowISO, todayISO, type ISODate } from '../../lib/dates';
import { budgetStatus, type BudgetProgress, type BudgetRow } from './progress';

/**
 * The budgets query boundary.
 *
 * The hard part is the window. A budget resetting on the 15th runs 15 Mar →
 * 14 Apr, so "spent this budget" is NOT "spent this calendar month" — getting
 * that wrong makes every figure on the screen quietly incorrect while looking
 * entirely plausible.
 *
 * The window is computed in TypeScript (lib/dates `getCycleWindow`, tested
 * exhaustively) and passed to SQL as bound parameters, as CLAUDE.md's data
 * model says. Spend is summed per budget by SQLite over `tx_cat_idx`; JS never
 * sees a transaction row here (#5).
 */

export type { BudgetProgress } from './progress';

const EMPTY: BudgetProgress[] = [];

/**
 * Every live budget with its category and this cycle's spend.
 *
 * One query, not one per budget: each budget's window is inlined as a pair of
 * bound dates inside a single CASE, so ten budgets with ten different reset
 * days still cost one pass.
 */
export function useBudgetsWithSpend(today: ISODate = todayISO()): DbQueryResult<BudgetProgress[]> {
  return useDbQuery(
    async () => withSpend(await budgetQueries.list(), today),
    // categories: a rename or recolour changes what a budget row draws.
    ['budgets', 'transactions', 'categories'],
    [today],
    EMPTY,
  );
}

/**
 * Attach each budget's cycle window and spend.
 *
 * Exported and pure-ish (it takes rows, returns rows) so the shape a screen
 * draws is testable without a database — see __tests__/progress.test.ts.
 */
async function withSpend(rows: BudgetRow[], today: ISODate): Promise<BudgetProgress[]> {
  if (rows.length === 0) return [];

  const windows = rows.map((b) => getCycleWindow(b.resetDay, today));
  const spendByCategory = await budgetQueries.spend(
    rows.map((b, i) => ({ categoryId: b.categoryId, start: windows[i]!.start, end: windows[i]!.end })),
  );
  const byId = new Map(spendByCategory.map((r) => [r.categoryId, r.spentPaise]));

  return rows.map((b, i) => budgetStatus(b, windows[i]!, byId.get(b.categoryId) ?? 0));
}

export interface BudgetSpendKey {
  categoryId: number;
  start: ISODate;
  end: ISODate;
}

export const budgetQueries = {
  /** Live budgets, with the category they belong to. */
  list: () =>
    readDb
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        limitPaise: budgets.limitPaise,
        resetDay: budgets.resetDay,
        isActive: budgets.isActive,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(and(isNull(budgets.deletedAt), isNull(categories.deletedAt)))
      .orderBy(asc(categories.name)) as Promise<BudgetRow[]>,

  /**
   * Expense total per category, each within its OWN date window.
   *
   * The windows differ per budget, so a single `WHERE date BETWEEN ? AND ?`
   * cannot serve them all; instead each category contributes a CASE that only
   * counts rows inside its window. One pass, one row per category.
   */
  spend: (keys: BudgetSpendKey[]) => {
    if (keys.length === 0) return Promise.resolve([] as { categoryId: number; spentPaise: number }[]);
    const inWindow = sql.join(
      keys.map(
        (k) =>
          sql`(${transactions.categoryId} = ${k.categoryId} and ${transactions.date} >= ${k.start} and ${transactions.date} <= ${k.end})`,
      ),
      sql` or `,
    );
    return readDb
      .select({
        categoryId: sql<number>`${transactions.categoryId}`,
        spentPaise: sql<number>`coalesce(sum(${transactions.amountPaise}), 0)`,
      })
      .from(transactions)
      .where(and(isNull(transactions.deletedAt), eq(transactions.type, 'expense'), sql`(${inWindow})`))
      .groupBy(transactions.categoryId) as Promise<{ categoryId: number; spentPaise: number }[]>;
  },
};

/** Categories that have no live budget yet — what the create form may offer. */
export function useBudgetableCategories(excludeBudgetId?: number) {
  return useDbQuery(
    async () => {
      const taken = await readDb
        .select({ categoryId: budgets.categoryId, id: budgets.id })
        .from(budgets)
        .where(isNull(budgets.deletedAt));
      const used = new Set(taken.filter((t) => t.id !== excludeBudgetId).map((t) => t.categoryId));
      const rows = await readDb
        .select({ id: categories.id, name: categories.name, icon: categories.icon, color: categories.color })
        .from(categories)
        // Income categories cannot go over budget, so they are not offered.
        .where(and(isNull(categories.deletedAt), sql`${categories.kind} in ('expense', 'both')`))
        .orderBy(asc(categories.name));
      return rows.filter((c) => !used.has(c.id));
    },
    ['budgets', 'categories'],
    [excludeBudgetId ?? 0],
    [],
  );
}

/** One budget for the edit form — a point read, so it uses the sync handle. */
export function getBudget(id: number) {
  const rows = db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      limitPaise: budgets.limitPaise,
      resetDay: budgets.resetDay,
      isActive: budgets.isActive,
    })
    .from(budgets)
    .where(and(eq(budgets.id, id), isNull(budgets.deletedAt)))
    .limit(1)
    .all();
  return rows[0];
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface BudgetInput {
  categoryId: number;
  /** Integer paise — the form parses the typed string, never a float. */
  limitPaise: number;
  /** 1–31. 31 means "last day of the month" in shorter months (getCycleWindow clamps). */
  resetDay: number;
  isActive?: boolean;
}

export function createBudget(input: BudgetInput): WriteResult<number> {
  return safeWrite('save the budget', () => {
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
  });
}

export function updateBudget(id: number, input: BudgetInput): WriteResult<void> {
  return safeWrite('save the changes', () => {
    db.update(budgets)
      .set({
        categoryId: input.categoryId,
        limitPaise: input.limitPaise,
        resetDay: input.resetDay,
        isActive: input.isActive ?? true,
      })
      .where(eq(budgets.id, id))
      .run();
  });
}

/** Soft delete, so the undo toast can put it back (#13). */
export function softDeleteBudget(id: number): WriteResult<void> {
  return safeWrite('delete the budget', () => {
    db.update(budgets).set({ deletedAt: nowISO() }).where(eq(budgets.id, id)).run();
  });
}

export function restoreBudget(id: number): WriteResult<void> {
  return safeWrite('restore the budget', () => {
    // The partial unique index allows only one LIVE budget per category, so a
    // restore can clash with one created since. safeWrite turns that into a
    // toast rather than a crash.
    db.update(budgets).set({ deletedAt: null }).where(eq(budgets.id, id)).run();
  });
}

/**
 * Budgets whose category matches a just-written transaction, for Phase 8's
 * 75%/100% alerts. Kept here so the alert and the screen agree on the figure.
 */
export function budgetProgressForCategory(categoryId: number, today: ISODate = todayISO()): BudgetProgress | null {
  const rows = db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      limitPaise: budgets.limitPaise,
      resetDay: budgets.resetDay,
      isActive: budgets.isActive,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.categoryId, categoryId), isNull(budgets.deletedAt), eq(budgets.isActive, true)))
    .limit(1)
    .all() as BudgetRow[];

  const budget = rows[0];
  if (!budget) return null;

  const window = getCycleWindow(budget.resetDay, today);
  const spent = db
    .select({ spentPaise: sql<number>`coalesce(sum(${transactions.amountPaise}), 0)` })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.type, 'expense'),
        eq(transactions.categoryId, categoryId),
        sql`${transactions.date} >= ${window.start}`,
        lte(transactions.date, window.end),
      ),
    )
    .all();

  return budgetStatus(budget, window, spent[0]?.spentPaise ?? 0);
}
