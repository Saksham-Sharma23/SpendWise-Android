import { and, eq, isNull, ne, sql } from 'drizzle-orm';

import { UserFacingError } from '@/lib/db/errors';
import { nowISO } from '@/lib/dates';
import { runWriteTx } from '@/db/tx';
import { budgets, categories, splitExpenses, subscriptions, transactions } from '@/db/schema';
import type { SyncDb } from '@/db/types';

/**
 * Category writes — create, rename/recolour, merge, delete.
 *
 * Every function takes the database as a parameter and imports no native
 * module, so the same code runs against the phone's expo-sqlite handle and
 * against better-sqlite3 in Jest, where merge and delete are proven on a real
 * migrated schema. (queries.ts binds these to the app's `db`.)
 *
 * Two schema facts shape all of it:
 *   - A deleted category's name is rewritten to a tombstone. Before migration
 *     0006 made `cat_name_unique` partial (live rows only) this was required;
 *     it is now merely tidy — the tombstone keeps "Food ⟨deleted #7⟩" readable
 *     in a future "Recently deleted" list without clashing with a new "Food".
 *   - `budget_cat_unique` is unique on category_id among LIVE budgets since
 *     migration 0001, so a soft-deleted budget no longer blocks moving one in.
 */

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

function liveCategory(database: SyncDb, id: number) {
  const row = database
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .limit(1)
    .all()[0];
  if (!row) throw new UserFacingError('That category no longer exists');
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
  if (clash) throw new UserFacingError(`A category called “${name}” already exists`);
}

function validName(raw: string): string {
  const name = normalizeCategoryName(raw);
  if (!name) throw new UserFacingError('Give the category a name');
  if (name.length > MAX_CATEGORY_NAME) throw new UserFacingError(`Keep the name under ${MAX_CATEGORY_NAME} characters`);
  return name;
}

export function createCategory(database: SyncDb, input: CategoryInput): number {
  const name = validName(input.name);
  assertNameFree(database, name);
  const row = database
    .insert(categories)
    .values({ name, color: input.color, icon: input.icon, isSystem: false, createdAt: nowISO() })
    .returning({ id: categories.id })
    .all()[0];
  return row!.id;
}

/** Rename, recolour and/or re-icon. System categories may be edited, just not deleted. */
export function updateCategory(database: SyncDb, id: number, input: CategoryInput): void {
  liveCategory(database, id);
  const name = validName(input.name);
  assertNameFree(database, name, id);
  database.update(categories).set({ name, color: input.color, icon: input.icon }).where(eq(categories.id, id)).run();
}

/** Soft-delete a category row and release its name. Callers move its references first. */
function retire(database: SyncDb, id: number, name: string): void {
  database
    .update(categories)
    .set({ deletedAt: nowISO(), name: tombstoneName(name, id) })
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
  if (sourceId === targetId) throw new UserFacingError('Pick a different category to merge into');
  const source = liveCategory(database, sourceId);
  liveCategory(database, targetId);
  if (source.isSystem) throw new UserFacingError('Built-in categories can be merged into, but not merged away');

  return runWriteTx(database, (tx) => {
    // Includes soft-deleted transactions, so undoing a delete later restores
    // the row into a category that still exists.
    const moved = countTransactions(tx, sourceId);
    tx.update(transactions).set({ categoryId: targetId }).where(eq(transactions.categoryId, sourceId)).run();
    tx.update(subscriptions).set({ categoryId: targetId }).where(eq(subscriptions.categoryId, sourceId)).run();
    // Group expenses too (B4). Groups was built after this file, so it was
    // missed: a merged-away category left group totals pointing at a retired
    // row, which groupCategoryQuery then displayed by its tombstone name.
    tx.update(splitExpenses).set({ categoryId: targetId }).where(eq(splitExpenses.categoryId, sourceId)).run();

    const targetLive = tx
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.categoryId, targetId), isNull(budgets.deletedAt)))
      .all()[0];

    if (targetLive) {
      tx.update(budgets)
        .set({ deletedAt: nowISO() })
        .where(and(eq(budgets.categoryId, sourceId), isNull(budgets.deletedAt)))
        .run();
    } else {
      // The source's budget takes the target's empty slot. Nothing is deleted
      // (B15): `budget_cat_unique` has been PARTIAL (WHERE deleted_at IS NULL)
      // since migration 0001, so the target's soft-deleted budgets never held
      // the slot. The old hard delete destroyed budget history to satisfy a
      // constraint that had not applied for six migrations.
      tx.update(budgets).set({ categoryId: targetId }).where(eq(budgets.categoryId, sourceId)).run();
    }

    retire(tx, sourceId, source.name);
    return { moved };
  });
}

/**
 * Delete a category. Its transactions and subscriptions become
 * Uncategorised rather than disappearing; its budget is retired.
 */
export function deleteCategory(database: SyncDb, id: number): { uncategorised: number } {
  const cat = liveCategory(database, id);
  if (cat.isSystem) throw new UserFacingError('Built-in categories cannot be deleted — merge or rename them instead');

  return runWriteTx(database, (tx) => {
    const uncategorised = countTransactions(tx, id);
    tx.update(transactions).set({ categoryId: null }).where(eq(transactions.categoryId, id)).run();
    tx.update(subscriptions).set({ categoryId: null }).where(eq(subscriptions.categoryId, id)).run();
    // Group expenses become uncategorised too (B4), rather than keeping a
    // reference to the row this function is about to retire and rename.
    tx.update(splitExpenses).set({ categoryId: null }).where(eq(splitExpenses.categoryId, id)).run();
    tx.update(budgets)
      .set({ deletedAt: nowISO() })
      .where(and(eq(budgets.categoryId, id), isNull(budgets.deletedAt)))
      .run();
    retire(tx, id, cat.name);
    return { uncategorised };
  });
}
