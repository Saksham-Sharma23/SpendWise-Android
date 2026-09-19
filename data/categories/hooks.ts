import { readDb } from '@/db/read';
import { useDbQuery, type DbQueryResult } from '@/lib/db/useDbQuery';
import { liveCategoriesQuery, type Category, type CategoryFor } from './sql';

const EMPTY: Category[] = [];

/** All live categories, or only those that fit `kind`. Re-reads on any category change. */
export function useCategories(kind?: CategoryFor): DbQueryResult<Category[]> {
  return useDbQuery(async () => (await liveCategoriesQuery(readDb, kind)) as Category[], ['categories'], [kind], EMPTY);
}
