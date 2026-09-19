import { and, asc, inArray, isNull } from 'drizzle-orm';

import { categories, type Category } from '@/db/schema';
import type { AnyDb } from '@/db/types';

/**
 * The live category list — the ONE definition of it (R3-3). Pure: it takes
 * the database, so data/__tests__ runs this exact SQL on better-sqlite3.
 */

export type { Category };
export type CategoryFor = 'expense' | 'income';

/**
 * Live categories, alphabetical. With `kind`, only those that fit that type:
 * a category is `expense`, `income` or `both`, so "Salary" is never offered on
 * an expense.
 */
export function liveCategoriesQuery(db: AnyDb, kind?: CategoryFor) {
  return db
    .select()
    .from(categories)
    .where(and(isNull(categories.deletedAt), kind ? inArray(categories.kind, [kind, 'both']) : undefined))
    .orderBy(asc(categories.name));
}

/** Whether `category` may be used for a transaction of `type`. For pickers. */
export function fitsType(category: Pick<Category, 'kind'>, type: CategoryFor): boolean {
  return category.kind === type || category.kind === 'both';
}
