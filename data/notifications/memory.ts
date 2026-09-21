import { createMMKV } from 'react-native-mmkv';

import type { BudgetAlertLevel } from '@/lib/notifications';

/**
 * What has already been announced for a budget, so an alert fires once per
 * threshold rather than on every transaction past it.
 *
 * MMKV, not the database: this is app state, not a record. It is deliberately
 * NOT in a backup either — restoring last month's "already warned" onto a
 * fresh phone would silence a real alert.
 *
 * The key carries the CYCLE START, so a new cycle gets a new key and the
 * memory resets itself. Nothing has to notice the rollover or clear anything,
 * which is the only version of this that cannot leak a stale "already sent"
 * into the following month.
 */

const storage = createMMKV({ id: 'spendwise-notify' });

function key(categoryId: number, cycleStart: string): string {
  return `budget:${categoryId}:${cycleStart}`;
}

export function alreadyNotified(categoryId: number, cycleStart: string): BudgetAlertLevel | null {
  try {
    const raw = storage.getString(key(categoryId, cycleStart));
    return raw === 'warning' || raw === 'over' ? raw : null;
  } catch {
    // A missing or corrupt store must cost at most a duplicate alert.
    return null;
  }
}

export function rememberNotified(categoryId: number, cycleStart: string, level: BudgetAlertLevel): void {
  try {
    storage.set(key(categoryId, cycleStart), level);
  } catch {
    // Losing the memory means one repeated alert, which is survivable.
  }
}

/** Used by "delete all data" and by the dev harness. */
export function forgetAllBudgetAlerts(): void {
  try {
    for (const k of storage.getAllKeys()) {
      if (k.startsWith('budget:')) storage.remove(k);
    }
  } catch {
    // Nothing to do: the keys expire with their cycle anyway.
  }
}
