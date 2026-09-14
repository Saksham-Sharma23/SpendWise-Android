import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../../db/client';
import { readDb } from '../../db/read';
import { categories, transactions } from '../../db/schema';
import { useDbQuery, type DbQueryResult } from '../../lib/db/useDbQuery';
import * as m from './mutations';

/**
 * The categories query boundary. Reads are live; writes delegate to
 * mutations.ts (database-agnostic, tested against a real schema in Node)
 * bound to the app's handle.
 */

export { CategoryError, MAX_CATEGORY_NAME, type CategoryInput } from './mutations';

export interface CategoryWithUsage {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  transactionCount: number;
}

/**
 * Every live category with how many live transactions use it — counted in
 * SQL through tx_cat_idx, never by loading transactions (CLAUDE.md #5).
 */
/** Result form, for screens that must tell "still loading" from "genuinely none". */
export function useCategoriesWithUsageResult(): DbQueryResult<CategoryWithUsage[]> {
  return useDbQuery(
    async () =>
      (await readDb
        .select({
          id: categories.id,
          name: categories.name,
          icon: categories.icon,
          color: categories.color,
          isSystem: categories.isSystem,
          transactionCount: sql<number>`count(${transactions.id})`,
        })
        .from(categories)
        .leftJoin(
          transactions,
          and(eq(transactions.categoryId, categories.id), isNull(transactions.deletedAt)),
        )
        .where(isNull(categories.deletedAt))
        .groupBy(categories.id)
        .orderBy(asc(sql`lower(${categories.name})`))) as CategoryWithUsage[],
    // Counts change when transactions do, not just when categories do.
    ['categories', 'transactions'],
    [],
    [] as CategoryWithUsage[],
  );
}

export function useCategoriesWithUsage(): CategoryWithUsage[] {
  return useCategoriesWithUsageResult().data;
}

export function getCategory(id: number) {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .limit(1)
    .all()[0];
}

const handle = db as unknown as m.SyncDb;

export const createCategory = (input: m.CategoryInput) => m.createCategory(handle, input);
export const updateCategory = (id: number, input: m.CategoryInput) => m.updateCategory(handle, id, input);
export const mergeCategory = (sourceId: number, targetId: number) => m.mergeCategory(handle, sourceId, targetId);
export const deleteCategory = (id: number) => m.deleteCategory(handle, id);
