import { db } from '@/db/client';
import type { Category } from '@/db/schema';
import { allSync } from '@/db/types';
import { safeWrite, type WriteResult } from '@/lib/db/safeWrite';
import { categoryQuery } from './sql';
import * as w from './writes';

/**
 * What screens call to change categories. Each write is bound to the app's
 * handle and wrapped in safeWrite, so a rule the user broke ("A category
 * called Food already exists") is toasted verbatim and the form stays open.
 *
 * Categories used to be the one feature that threw its own `CategoryError`
 * and made every screen try/catch (R3-11). They now fail the same way as
 * every other write: `UserFacingError` inside, `WriteResult` outside.
 */

export function createCategory(input: w.CategoryInput): WriteResult<number> {
  return safeWrite('save the category', () => w.createCategory(db, input));
}

export function updateCategory(id: number, input: w.CategoryInput): WriteResult<void> {
  return safeWrite('save the category', () => w.updateCategory(db, id, input));
}

export function mergeCategory(sourceId: number, targetId: number): WriteResult<{ moved: number }> {
  return safeWrite('merge the categories', () => w.mergeCategory(db, sourceId, targetId));
}

export function deleteCategory(id: number): WriteResult<{ uncategorised: number }> {
  return safeWrite('delete the category', () => w.deleteCategory(db, id));
}

/** One category for the editor — a point read, so the sync handle. */
export function getCategory(id: number): Category | undefined {
  return allSync<Category>(categoryQuery(db, id))[0];
}
