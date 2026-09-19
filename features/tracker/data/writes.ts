import { eq } from 'drizzle-orm';

import { subscriptions } from '@/db/schema';
import type { BillingCycle, SubscriptionStatus } from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { nowISO, type ISODate } from '@/lib/dates';

/**
 * The Tracker's write cores. They take a sync `db`, so tests run them on
 * better-sqlite3; screens call ./actions.ts.
 */

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

export function insertSubscription(db: SyncDb, input: SubscriptionInput): number {
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
}

export function changeSubscription(db: SyncDb, id: number, input: SubscriptionInput): void {
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
}

/**
 * Pause, resume and cancel are one status change, exactly as on the web (a
 * PATCH with a new status, not three endpoints), which stops three paths
 * drifting apart.
 */
export function changeSubscriptionStatus(db: SyncDb, id: number, status: SubscriptionStatus): void {
  db.update(subscriptions).set({ status }).where(eq(subscriptions.id, id)).run();
}

/** Soft delete, so the undo toast can put it back (CLAUDE.md #10). */
export function retireSubscription(db: SyncDb, id: number): void {
  db.update(subscriptions).set({ deletedAt: nowISO() }).where(eq(subscriptions.id, id)).run();
}

export function unretireSubscription(db: SyncDb, id: number): void {
  db.update(subscriptions).set({ deletedAt: null }).where(eq(subscriptions.id, id)).run();
}
