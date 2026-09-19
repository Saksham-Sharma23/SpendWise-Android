import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { transactions, type TransactionType } from '@/db/schema';
import { allSync, type SyncDb } from '@/db/types';
import { makeDedupeHash } from '@/lib/dedupe';
import { nowISO, type ISODate } from '@/lib/dates';
import { existingHashesQuery, recentlyDeletedWhere } from './sql';

/**
 * The ledger's write cores. They take a sync `db`, so tests run them on
 * better-sqlite3; screens call ./actions.ts, which binds them to the app's
 * handle and reports failure through safeWrite.
 */

export interface TransactionInput {
  type: TransactionType;
  /** Integer paise. The form converts before calling — never a float here. */
  amountPaise: number;
  date: ISODate;
  note?: string | null;
  categoryId?: number | null;
}

export function insertTransaction(db: SyncDb, input: TransactionInput): number {
  const now = nowISO();
  const row = db
    .insert(transactions)
    .values({
      type: input.type,
      amountPaise: input.amountPaise,
      date: input.date,
      note: input.note ?? null,
      categoryId: input.categoryId ?? null,
      // Written on every create so Phase 6's importer can find existing rows
      // by an indexed lookup rather than scanning the table per candidate.
      dedupeHash: makeDedupeHash(input.date, input.amountPaise, input.note),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: transactions.id })
    .all();
  return row[0]!.id;
}

export function changeTransaction(db: SyncDb, id: number, input: TransactionInput): void {
  db.update(transactions)
    .set({
      type: input.type,
      amountPaise: input.amountPaise,
      date: input.date,
      note: input.note ?? null,
      categoryId: input.categoryId ?? null,
      // Recomputed: the fields it is derived from may all have changed.
      dedupeHash: makeDedupeHash(input.date, input.amountPaise, input.note),
      updatedAt: nowISO(),
    })
    .where(eq(transactions.id, id))
    .run();
}

/**
 * Soft delete. The row stays so the undo toast can put it back, and so a
 * whole import batch can be reversed later (CLAUDE.md #10).
 */
export function retireTransactions(db: SyncDb, ids: readonly number[]): void {
  if (ids.length === 0) return;
  db.update(transactions)
    .set({ deletedAt: nowISO() })
    .where(inArray(transactions.id, [...ids]))
    .run();
}

/** Undo a soft delete. */
export function unretireTransactions(db: SyncDb, ids: readonly number[]): void {
  if (ids.length === 0) return;
  db.update(transactions)
    .set({ deletedAt: null })
    .where(inArray(transactions.id, [...ids]))
    .run();
}

/**
 * Remove deleted transactions for good, ahead of the purge. The predicate
 * repeats `deleted_at IS NOT NULL`, so this can never remove a live row even
 * if a stale id reaches it; import-batch rows are never removed one by one.
 */
export function purgeTransactions(db: SyncDb, ids: readonly number[]): void {
  if (ids.length === 0) return;
  db.delete(transactions)
    .where(
      and(inArray(transactions.id, [...ids]), isNotNull(transactions.deletedAt), isNull(transactions.importBatchId)),
    )
    .run();
}

/**
 * Empty Recently deleted: every row it holds, however many (B24). "Empty" used
 * to pass the ids it had listed, and the list stops at DELETED_LIST_LIMIT, so
 * after a large bulk delete it left the rest behind while saying it had
 * removed everything. Returns how many rows went.
 */
export function purgeAllDeleted(db: SyncDb): number {
  const result = db.delete(transactions).where(recentlyDeletedWhere()).run();
  return Number((result as { changes?: number }).changes ?? 0);
}

/**
 * Which of these dedupe hashes already exist in the live ledger — one indexed
 * query per chunk rather than one per row. Phase 6 calls this with a few
 * thousand hashes at once; SQLite caps host parameters, hence the chunks.
 */
export function existingHashes(db: SyncDb, hashes: readonly string[]): Set<string> {
  const found = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < hashes.length; i += CHUNK) {
    for (const r of allSync<{ hash: string | null }>(existingHashesQuery(db, hashes.slice(i, i + CHUNK)))) {
      if (r.hash) found.add(r.hash);
    }
  }
  return found;
}
