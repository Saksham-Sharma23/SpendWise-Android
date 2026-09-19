import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { readDb } from '@/db/read';
import { categories, subscriptions } from '@/db/schema';
import type { BillingCycle, SubscriptionStatus } from '@/db/schema';
import { safeWrite, type WriteResult } from '@/lib/db/safeWrite';
import { useDbQuery, type DbQueryResult } from '@/lib/db/useDbQuery';
import { nowISO, todayISO, type ISODate } from '@/lib/dates';
import { enrich, type EnrichedSubscription, type SubscriptionRow } from './renewal';

/**
 * The Tracker's query boundary.
 *
 * Renewal dates, monthly cost and urgency are NOT stored — they are computed
 * on read in ./renewal.ts, the port of the web app's `_enrich`. That is what
 * makes the feature self-correcting: an app left closed for three months
 * still shows the right next renewal, with no background job to drift.
 */

export type { EnrichedSubscription } from './renewal';

const EMPTY: EnrichedSubscription[] = [];

const columns = {
  id: subscriptions.id,
  name: subscriptions.name,
  amountPaise: subscriptions.amountPaise,
  billingCycle: subscriptions.billingCycle,
  status: subscriptions.status,
  anchorDate: subscriptions.anchorDate,
  categoryId: subscriptions.categoryId,
  reminderDaysBefore: subscriptions.reminderDaysBefore,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  categoryColor: categories.color,
};

/**
 * Every live subscription, enriched. Sorting and filtering happen in JS on the
 * enriched rows because both depend on the computed renewal date — and the
 * Tracker holds tens of rows, not tens of thousands.
 */
export function useSubscriptions(today: ISODate = todayISO()): DbQueryResult<EnrichedSubscription[]> {
  return useDbQuery(
    async () => {
      const rows = (await trackerQueries.list()) as SubscriptionRow[];
      return rows.map((r) => enrich(r, today));
    },
    ['subscriptions', 'categories'],
    [today],
    EMPTY,
  );
}

export const trackerQueries = {
  list: () =>
    readDb
      .select(columns)
      .from(subscriptions)
      .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
      .where(isNull(subscriptions.deletedAt))
      .orderBy(asc(subscriptions.name)),
};

/** One subscription for the edit form — a point read, so the sync handle. */
export function getSubscription(id: number): SubscriptionRow | undefined {
  const rows = db
    .select(columns)
    .from(subscriptions)
    .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
    .where(and(eq(subscriptions.id, id), isNull(subscriptions.deletedAt)))
    .limit(1)
    .all();
  return rows[0] as SubscriptionRow | undefined;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface SubscriptionInput {
  name: string;
  /** Integer paise — the amount charged each cycle, not the monthly equivalent. */
  amountPaise: number;
  billingCycle: BillingCycle;
  /** Any past or future occurrence; the next one is derived from it. */
  anchorDate: ISODate;
  categoryId?: number | null;
  reminderDaysBefore?: number;
  status?: SubscriptionStatus;
}

export function createSubscription(input: SubscriptionInput): WriteResult<number> {
  return safeWrite('save the subscription', () => {
    const rows = db
      .insert(subscriptions)
      .values({
        name: input.name,
        amountPaise: input.amountPaise,
        billingCycle: input.billingCycle,
        anchorDate: input.anchorDate,
        categoryId: input.categoryId ?? null,
        reminderDaysBefore: input.reminderDaysBefore ?? 2,
        status: input.status ?? 'active',
      })
      .returning({ id: subscriptions.id })
      .all();
    return rows[0]!.id;
  });
}

export function updateSubscription(id: number, input: SubscriptionInput): WriteResult<void> {
  return safeWrite('save the changes', () => {
    db.update(subscriptions)
      .set({
        name: input.name,
        amountPaise: input.amountPaise,
        billingCycle: input.billingCycle,
        anchorDate: input.anchorDate,
        categoryId: input.categoryId ?? null,
        reminderDaysBefore: input.reminderDaysBefore ?? 2,
        ...(input.status ? { status: input.status } : {}),
      })
      .where(eq(subscriptions.id, id))
      .run();
  });
}

/**
 * Pause, resume and cancel are all one status change, exactly as on the web
 * (a PATCH with a new status, not three endpoints). Keeping them as one
 * operation is what stops the three paths drifting apart.
 */
export function setSubscriptionStatus(id: number, status: SubscriptionStatus): WriteResult<void> {
  const verb = status === 'paused' ? 'pause it' : status === 'cancelled' ? 'cancel it' : 'resume it';
  return safeWrite(verb, () => {
    db.update(subscriptions).set({ status }).where(eq(subscriptions.id, id)).run();
  });
}

export function softDeleteSubscription(id: number): WriteResult<void> {
  return safeWrite('delete the subscription', () => {
    db.update(subscriptions).set({ deletedAt: nowISO() }).where(eq(subscriptions.id, id)).run();
  });
}

export function restoreSubscription(id: number): WriteResult<void> {
  return safeWrite('restore the subscription', () => {
    db.update(subscriptions).set({ deletedAt: null }).where(eq(subscriptions.id, id)).run();
  });
}
