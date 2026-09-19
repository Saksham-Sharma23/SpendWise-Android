import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { budgets, categories } from '@/db/schema';
import type { AnyDb } from '@/db/types';

/**
 * Budgets' read builders. Each takes `db`, so the same SQL runs through the
 * read handle on the phone and on better-sqlite3 in tests.
 *
 * Spend is NOT here: it is `budgetSpend` in `@/data/ledger`, shared with
 * Home's budget card (R3-9). The window is computed in TypeScript
 * (lib/dates `getCycleWindow`) and bound as parameters.
 */

const budgetColumns = {
  id: budgets.id,
  categoryId: budgets.categoryId,
  limitPaise: budgets.limitPaise,
  resetDay: budgets.resetDay,
  isActive: budgets.isActive,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  categoryColor: categories.color,
};

/** Live budgets whose category is live, with that category's look. */
export function budgetListQuery(db: AnyDb) {
  return db
    .select(budgetColumns)
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(isNull(budgets.deletedAt), isNull(categories.deletedAt)))
    .orderBy(asc(categories.name));
}

/** The live, active budget on one category, if any. */
export function budgetForCategoryQuery(db: AnyDb, categoryId: number) {
  return db
    .select(budgetColumns)
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(and(eq(budgets.categoryId, categoryId), isNull(budgets.deletedAt), eq(budgets.isActive, true)))
    .limit(1);
}

/** One budget, for the edit form. */
export function budgetForEditQuery(db: AnyDb, id: number) {
  return db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      limitPaise: budgets.limitPaise,
      resetDay: budgets.resetDay,
      isActive: budgets.isActive,
    })
    .from(budgets)
    .where(and(eq(budgets.id, id), isNull(budgets.deletedAt)))
    .limit(1);
}

/** Which categories already have a live budget (only one each is allowed). */
export function takenCategoriesQuery(db: AnyDb) {
  return db.select({ categoryId: budgets.categoryId, id: budgets.id }).from(budgets).where(isNull(budgets.deletedAt));
}

/** Categories a budget can be set on: live, and not income-only — income cannot go over budget. */
export function budgetableCategoriesQuery(db: AnyDb) {
  return db
    .select({ id: categories.id, name: categories.name, icon: categories.icon, color: categories.color })
    .from(categories)
    .where(and(isNull(categories.deletedAt), sql`${categories.kind} in ('expense', 'both')`))
    .orderBy(asc(categories.name));
}
