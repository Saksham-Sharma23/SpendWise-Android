import { db } from '@/db/client';
import { safeWrite, type WriteResult } from '@/lib/db/safeWrite';
import type { PlannedSettlement } from '../domain/balances';
import {
  createGroup,
  createPerson,
  deleteExpense,
  deleteGroup,
  deletePerson,
  deleteSettlements,
  getOrCreateDirectGroup,
  recordSettlement,
  recordSettlements,
  renamePerson,
  restoreExpense,
  restoreGroup,
  restorePerson,
  restoreSettlements,
  saveExpense,
  updateGroup,
  type ExpenseInput,
  type GroupInput,
  type SettlementInput,
} from './writes';
import type { SyncDb } from '@/db/types';

/**
 * The Groups writes bound to the app's database, each wrapped in `safeWrite`
 * so a failure — or a refused rule like "Settle Rahul's ₹500 first" — becomes
 * a toast and a result the screen branches on (CLAUDE.md #9).
 *
 * Only FAILURES are toasted here, by safeWrite. The success toast, with its
 * Undo, belongs to the screen (R3-12): it knows the wording and whether it is
 * about to close. These used to raise success toasts from the data layer, the
 * one feature that did.
 */

const w: SyncDb = db;

export const addFriend = (name: string): WriteResult<number> =>
  safeWrite('add the friend', () => createPerson(w, name));

export const renameFriend = (id: number, name: string): WriteResult<void> =>
  safeWrite('rename the friend', () => renamePerson(w, id, name));

export const removeFriend = (id: number): WriteResult<void> =>
  safeWrite('remove the friend', () => deletePerson(w, id));

export const undoRemoveFriend = (id: number): WriteResult<void> => safeWrite('undo', () => restorePerson(w, id));

export const addGroup = (input: GroupInput): WriteResult<number> =>
  safeWrite('create the group', () => createGroup(w, input));

export const editGroup = (id: number, input: GroupInput): WriteResult<void> =>
  safeWrite('save the group', () => updateGroup(w, id, input));

export const removeGroup = (id: number): WriteResult<void> => safeWrite('delete the group', () => deleteGroup(w, id));

export const undoRemoveGroup = (id: number): WriteResult<void> => safeWrite('undo', () => restoreGroup(w, id));

/** The hidden 1:1 group for a friend, created on first use. */
export const directGroupFor = (personId: number): WriteResult<number> =>
  safeWrite('open the friend', () => getOrCreateDirectGroup(w, personId));

export const saveSplitExpense = (input: ExpenseInput, id?: number): WriteResult<number> =>
  safeWrite('save the expense', () => saveExpense(w, input, id));

export const removeExpense = (id: number): WriteResult<void> =>
  safeWrite('delete the expense', () => deleteExpense(w, id));

export const undoRemoveExpense = (id: number): WriteResult<void> => safeWrite('undo', () => restoreExpense(w, id));

export const settle = (input: SettlementInput): WriteResult<number> =>
  safeWrite('record the payment', () => recordSettlement(w, input));

export const settleMany = (plan: readonly PlannedSettlement[], date: string): WriteResult<number[]> =>
  safeWrite('record the payment', () => recordSettlements(w, plan, date));

export const removeSettlements = (ids: readonly number[]): WriteResult<void> =>
  safeWrite('delete the payment', () => deleteSettlements(w, ids));

export const undoRemoveSettlements = (ids: readonly number[]): WriteResult<void> =>
  safeWrite('undo', () => restoreSettlements(w, ids));
