import { toast } from 'sonner-native';

import { db } from '@/db/client';
import { safeWrite, type WriteResult } from '@/lib/db/safeWrite';
import type { PlannedSettlement } from './balances';
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
 * a toast and a result the screen branches on (CLAUDE.md #18). Deletes are
 * soft and offer Undo (#13).
 */

const w: SyncDb = db;

export const addFriend = (name: string): WriteResult<number> =>
  safeWrite('add the friend', () => createPerson(w, name));

export const renameFriend = (id: number, name: string): WriteResult<void> =>
  safeWrite('rename the friend', () => renamePerson(w, id, name));

export function removeFriend(id: number, name: string): WriteResult<void> {
  const result = safeWrite('remove the friend', () => deletePerson(w, id));
  if (result.ok) {
    toast.success(`${name} removed`, {
      action: { label: 'Undo', onClick: () => void safeWrite('undo', () => restorePerson(w, id)) },
    });
  }
  return result;
}

export const addGroup = (input: GroupInput): WriteResult<number> =>
  safeWrite('create the group', () => createGroup(w, input));

export const editGroup = (id: number, input: GroupInput): WriteResult<void> =>
  safeWrite('save the group', () => updateGroup(w, id, input));

export function removeGroup(id: number, name: string): WriteResult<void> {
  const result = safeWrite('delete the group', () => deleteGroup(w, id));
  if (result.ok) {
    toast.success(`${name} deleted`, {
      action: { label: 'Undo', onClick: () => void safeWrite('undo', () => restoreGroup(w, id)) },
    });
  }
  return result;
}

/** The hidden 1:1 group for a friend, created on first use. */
export const directGroupFor = (personId: number): WriteResult<number> =>
  safeWrite('open the friend', () => getOrCreateDirectGroup(w, personId));

export const saveSplitExpense = (input: ExpenseInput, id?: number): WriteResult<number> =>
  safeWrite('save the expense', () => saveExpense(w, input, id));

export function removeExpense(id: number, description: string): WriteResult<void> {
  const result = safeWrite('delete the expense', () => deleteExpense(w, id));
  if (result.ok) {
    toast.success(`${description} deleted`, {
      action: { label: 'Undo', onClick: () => void safeWrite('undo', () => restoreExpense(w, id)) },
    });
  }
  return result;
}

export const settle = (input: SettlementInput): WriteResult<number> =>
  safeWrite('record the payment', () => recordSettlement(w, input));

export const settleMany = (plan: readonly PlannedSettlement[], date: string): WriteResult<number[]> =>
  safeWrite('record the payment', () => recordSettlements(w, plan, date));

export function removeSettlements(ids: readonly number[]): WriteResult<void> {
  const result = safeWrite('delete the payment', () => deleteSettlements(w, ids));
  if (result.ok) {
    toast.success('Payment deleted', {
      action: { label: 'Undo', onClick: () => void safeWrite('undo', () => restoreSettlements(w, ids)) },
    });
  }
  return result;
}
