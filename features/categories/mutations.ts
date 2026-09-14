import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import * as schema from '../../db/schema';
import { budgets, categories, subscriptions, transactions } from '../../db/schema';

/**
 * Category writes — create, rename/recolour, merge, delete.
 *
 * Every function takes the database as a parameter and imports no native
 * module, so the same code runs against the phone's expo-sqlite handle and
 * against better-sqlite3 in Jest, where merge and delete are proven on a real
 * migrated schema. (queries.ts binds these to the app's `db`.)
 *
 * Two schema facts shape all of it:
 *   - `cat_name_unique` is a unique index on lower(name) that does NOT exclude
 *     soft-deleted rows. So a deleted category's name is rewritten to a
 *     tombstone; otherwise "Food" could never be created again after deleting
 *     "Food".
 *   - `budget_cat_unique` is unique on category_id, also including deleted
 *     rows — which is what makes moving budgets during a merge subtle.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SyncDb = BaseSQLiteDatabase<'sync', any, typeof schema>;

export class CategoryError extends Error {}

export interface CategoryInput {
  name: string;
  color: string;
  icon: string;
}

export const MAX_CATEGORY_NAME = 40;

/** Trim and collapse inner whitespace, so "  Food   out " and "Food out" are one name. */
export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** The name a soft-deleted category is parked under, freeing the real name. */
export function tombstoneName(name: string, id: number): string {
  return `${name} ⟨deleted #${id}⟩`;
}

function now(): string {
  return new Date().toISOString();
}

function liveCategory(database: SyncDb, id: number) {
  const row = database
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .limit(1)
    .all()[0];
  if (!row) throw new CategoryError('That category no longer exists');
  return row;
}

function assertNameFree(database: SyncDb, name: string, excludeId?: number): void {
  const clash = database
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        sql`lower(${categories.name}) = lower(${name})`,
        excludeId != null ? ne(categories.id, excludeId) : undefined,
      ),
    )
    .limit(1)
    .all()[0];
  if (clash) throw new CategoryError(`A category called “${name}” already exists`);
}

function validName(raw: string): string {
  const name = normalizeCategoryName(raw);
  if (!name) throw new CategoryError('Give the category a name');
  if (name.length > MAX_CATEGORY_NAME) throw new CategoryError(`Keep the name under ${MAX_CATEGORY_NAME} characters`);
  return name;
}

export function createCategory(database: SyncDb, input: CategoryInput): number {
  const name = validName(input.name);
  assertNameFree(database, name);
  const row = database
    .insert(categories)
    .values({ name, color: input.color, icon: input.icon, isSystem: false, createdAt: now() })
    .returning({ id: categories.id })
    .all()[0];
  return row!.id;
}

/** Rename, recolour and/or re-icon. System categories may be edited, just not deleted. */
export function updateCategory(database: SyncDb, id: number, input: CategoryInput): void {
  liveCategory(database, id);
  const name = validName(input.name);
  assertNameFree(database, name, id);
  database
    .update(categories)
    .set({ name, color: input.color, icon: input.icon })
    .where(eq(categories.id, id))
    .run();
}

/** Soft-delete a category row and release its name. Callers move its references first. */
function retire(database: SyncDb, id: number, name: string): void {
  database
    .update(categories)
    .set({ deletedAt: now(), name: tombstoneName(name, id) })
    .where(eq(categories.id, id))
    .run();
}

function countTransactions(database: SyncDb, categoryId: number): number {
  const row = database
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.categoryId, categoryId), isNull(transactions.deletedAt)))
    .all()[0];
  return row?.n ?? 0;
}

/**
 * Merge `sourceId` into `targetId`: every transaction and subscription moves
 * to the target, then the source is retired. This is the clean-up tool for
 * the near-duplicates an import creates ("Food" and "Food & Dining").
 *
 * Budgets: the target keeps its own live budget if it has one (the source's
 * is retired); otherwise the source's budget moves across. All in one
 * transaction, so a crash can never leave transactions pointing at a
 * half-merged category.
 */
export function mergeCategory(database: SyncDb, sourceId: number, targetId: number): { moved: number } {
  if (sourceId === targetId) throw new CategoryError('Pick a different category to merge into');
  const source = liveCategory(database, sourceId);
  liveCategory(database, targetId);
  if (source.isSystem) throw new CategoryError('Built-in categories can be merged into, but not merged away');

  return database.transaction((tx) => {
    // Includes soft-deleted transactions, so undoing a delete later restores
    // the row into a category that still exists.
    const moved = countTransactions(tx as SyncDb, sourceId);
    tx.update(transactions).set({ categoryId: targetId }).where(eq(transactions.categoryId, sourceId)).run();
    tx.update(subscriptions).set({ categoryId: targetId }).where(eq(subscriptions.categoryId, sourceId)).run();

    const targetLive = tx
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.categoryId, targetId), isNull(budgets.deletedAt)))
      .all()[0];

    if (targetLive) {
      tx.update(budgets)
        .set({ deletedAt: now() })
        .where(and(eq(budgets.categoryId, sourceId), isNull(budgets.deletedAt)))
        .run();
    } else {
      // A soft-deleted budget still holds the target's slot in the unique
      // index, so it has to go before the source's budget can take it.
      tx.delete(budgets).where(and(eq(budgets.categoryId, targetId), isNotNull(budgets.deletedAt))).run();
      tx.update(budgets).set({ categoryId: targetId }).where(eq(budgets.categoryId, sourceId)).run();
    }

    retire(tx as SyncDb, sourceId, source.name);
    return { moved };
  });
}

/**
 * Delete a category. Its transactions and subscriptions become
 * Uncategorised rather than disappearing; its budget is retired.
 */
export function deleteCategory(database: SyncDb, id: number): { uncategorised: number } {
  const cat = liveCategory(database, id);
  if (cat.isSystem) throw new CategoryError('Built-in categories cannot be deleted — merge or rename them instead');

  return database.transaction((tx) => {
    const uncategorised = countTransactions(tx as SyncDb, id);
    tx.update(transactions).set({ categoryId: null }).where(eq(transactions.categoryId, id)).run();
    tx.update(subscriptions).set({ categoryId: null }).where(eq(subscriptions.categoryId, id)).run();
    tx.update(budgets).set({ deletedAt: now() }).where(and(eq(budgets.categoryId, id), isNull(budgets.deletedAt))).run();
    retire(tx as SyncDb, id, cat.name);
    return { uncategorised };
  });
}
