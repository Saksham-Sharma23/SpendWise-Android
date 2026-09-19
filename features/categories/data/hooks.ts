import { readDb } from '@/db/read';
import { useDbQuery, type DbQueryResult } from '@/lib/db/useDbQuery';
import { categoriesWithUsageQuery, type CategoryWithUsage } from './sql';

const EMPTY: CategoryWithUsage[] = [];

/** Every live category with its usage count, as a full result (pending / ok / error). */
export function useCategoriesWithUsageResult(): DbQueryResult<CategoryWithUsage[]> {
  return useDbQuery(
    async () => (await categoriesWithUsageQuery(readDb)) as CategoryWithUsage[],
    // Counts change when transactions do, not just when categories do.
    ['categories', 'transactions'],
    [],
    EMPTY,
  );
}

/** Just the rows, for screens that need no loading state. */
export function useCategoriesWithUsage(): CategoryWithUsage[] {
  return useCategoriesWithUsageResult().data;
}
