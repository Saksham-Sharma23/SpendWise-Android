import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { categories, transactions } from '@/db/schema';
import type { AnyDb } from '@/db/types';

/**
 * Category management's read builders. The plain live list every picker uses
 * is NOT here — it is `@/data/categories`, shared by several features.
 */

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
export function categoriesWithUsageQuery(db: AnyDb) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      isSystem: categories.isSystem,
      transactionCount: sql<number>`count(${transactions.id})`,
    })
    .from(categories)
    .leftJoin(transactions, and(eq(transactions.categoryId, categories.id), isNull(transactions.deletedAt)))
    .where(isNull(categories.deletedAt))
    .groupBy(categories.id)
    .orderBy(asc(sql`lower(${categories.name})`));
}

/** One live category, for the editor. */
export function categoryQuery(db: AnyDb, id: number) {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .limit(1);
}
