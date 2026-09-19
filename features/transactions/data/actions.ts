import { db } from '@/db/client';
import { allSync } from '@/db/types';
import { safeWrite, type WriteResult } from '@/lib/db/safeWrite';
import { transactionQuery, type TransactionRow } from './sql';
import {
  changeTransaction,
  existingHashes,
  insertTransaction,
  purgeTransactions,
  retireTransactions,
  unretireTransactions,
  type TransactionInput,
} from './writes';

/**
 * What screens call to change the ledger. Each write is bound to the app's
 * handle and returns a WriteResult instead of throwing: on failure the user has
 * already seen a specific toast, and the caller only decides whether to stay
 * open (CLAUDE.md #9).
 */

export function createTransaction(input: TransactionInput): WriteResult<number> {
  return safeWrite('save the transaction', () => insertTransaction(db, input));
}

export function updateTransaction(id: number, input: TransactionInput): WriteResult<void> {
  return safeWrite('save the changes', () => changeTransaction(db, id, input));
}

export function softDeleteTransaction(id: number): WriteResult<void> {
  return safeWrite('delete the transaction', () => retireTransactions(db, [id]));
}

export function softDeleteTransactions(ids: number[]): WriteResult<void> {
  return safeWrite('delete those transactions', () => retireTransactions(db, ids));
}

/** Undo a soft delete. Drives the toast action. */
export function restoreTransactions(ids: number[]): WriteResult<void> {
  return safeWrite('restore', () => unretireTransactions(db, ids));
}

/** Remove deleted transactions for good, ahead of the 30-day purge. */
export function deleteTransactionsForever(ids: number[]): WriteResult<void> {
  return safeWrite('delete permanently', () => purgeTransactions(db, ids));
}

/** One transaction by id, for the edit form — a point read, so the sync handle. */
export function getTransaction(id: number): TransactionRow | undefined {
  return allSync<TransactionRow>(transactionQuery(db, id))[0];
}

/** Which of these dedupe hashes already exist in the live ledger (Phase 6's importer). */
export function findExistingHashes(hashes: string[]): Set<string> {
  return existingHashes(db, hashes);
}
