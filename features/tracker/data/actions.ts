import { db } from '@/db/client';
import type { SubscriptionStatus } from '@/db/schema';
import { allSync } from '@/db/types';
import { safeWrite, type WriteResult } from '@/lib/db/safeWrite';
import type { SubscriptionRow } from '../domain/renewal';
import { subscriptionQuery } from './sql';
import {
  changeSubscription,
  changeSubscriptionStatus,
  insertSubscription,
  retireSubscription,
  unretireSubscription,
  type SubscriptionInput,
} from './writes';

/**
 * What screens call to change subscriptions: bound to the app's handle and
 * wrapped in safeWrite, which toasts a failure and returns `{ ok: false }`.
 */

export function createSubscription(input: SubscriptionInput): WriteResult<number> {
  return safeWrite('save the subscription', () => insertSubscription(db, input));
}

export function updateSubscription(id: number, input: SubscriptionInput): WriteResult<void> {
  return safeWrite('save the changes', () => changeSubscription(db, id, input));
}

export function setSubscriptionStatus(id: number, status: SubscriptionStatus): WriteResult<void> {
  const verb = status === 'paused' ? 'pause it' : status === 'cancelled' ? 'cancel it' : 'resume it';
  return safeWrite(verb, () => changeSubscriptionStatus(db, id, status));
}

export function softDeleteSubscription(id: number): WriteResult<void> {
  return safeWrite('delete the subscription', () => retireSubscription(db, id));
}

export function restoreSubscription(id: number): WriteResult<void> {
  return safeWrite('restore the subscription', () => unretireSubscription(db, id));
}

/** One subscription for the edit form — a point read, so the sync handle. */
export function getSubscription(id: number): SubscriptionRow | undefined {
  return allSync<SubscriptionRow>(subscriptionQuery(db, id))[0];
}
