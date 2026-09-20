import type { ISODate } from '@/lib/dates';
import {
  enrich,
  type BillingCycle,
  type Enriched,
  type RenewalInput,
  type SubscriptionStatus,
} from '@/lib/subscriptions';

/**
 * The Tracker's own logic: which rows to show, in what order, and the four
 * summary figures.
 *
 * The renewal maths is NOT here. Next renewal, days until, monthly and yearly
 * equivalents and urgency all come from `lib/subscriptions.enrich`, which
 * Home uses too — this file used to compute them a second time under
 * different names (A10).
 */

export interface SubscriptionRow extends RenewalInput {
  id: number;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  categoryId: number | null;
  reminderDaysBefore: number;
  categoryName: string | null;
}

export type EnrichedSubscription = Enriched<SubscriptionRow>;

/** Kept as the Tracker's entry point so callers need not know where enrich lives. */
export function enrichSubscription(row: SubscriptionRow, today?: ISODate): EnrichedSubscription {
  return enrich(row, today);
}

export type SubscriptionSort = 'renewal' | 'amount' | 'name';
export type StatusFilter = 'active' | 'paused' | 'cancelled' | 'all';

/**
 * Filter by status, then sort. Cancelled subscriptions sort last within
 * "all": they have a computed renewal date like any other row, but it is not
 * going to happen, so letting it lead the list would be a lie.
 */
export function arrange(
  rows: EnrichedSubscription[],
  status: StatusFilter,
  sort: SubscriptionSort,
): EnrichedSubscription[] {
  const filtered = status === 'all' ? rows.slice() : rows.filter((r) => r.status === status);

  const rank = (r: EnrichedSubscription) => (r.status === 'active' ? 0 : r.status === 'paused' ? 1 : 2);

  return filtered.sort((a, b) => {
    if (status === 'all') {
      const byStatus = rank(a) - rank(b);
      if (byStatus !== 0) return byStatus;
    }
    switch (sort) {
      case 'renewal': {
        const d = a.daysUntil - b.daysUntil;
        if (d !== 0) return d;
        break;
      }
      case 'amount': {
        // By monthly equivalent: comparing a ₹1,499 yearly against a ₹199
        // monthly on the raw charge would rank them the wrong way round.
        const d = b.monthlyCostPaise - a.monthlyCostPaise;
        if (d !== 0) return d;
        break;
      }
      case 'name':
        break;
    }
    return a.name.localeCompare(b.name);
  });
}

export interface TrackerSummary {
  monthlyTotalPaise: number;
  yearlyTotalPaise: number;
  activeCount: number;
  dueSoonCount: number;
  next: EnrichedSubscription | null;
}

/** The four summary figures. Active subscriptions only — the others cost nothing. */
export function summarise(rows: EnrichedSubscription[]): TrackerSummary {
  const active = rows.filter((r) => r.status === 'active');
  let monthlyTotalPaise = 0;
  // Summed from each row's EXACT yearly cost, not monthlyTotal × 12, which
  // would multiply every row's rounding error by twelve (B3).
  let yearlyTotalPaise = 0;
  let dueSoonCount = 0;
  let next: EnrichedSubscription | null = null;

  for (const r of active) {
    monthlyTotalPaise += r.monthlyCostPaise;
    yearlyTotalPaise += r.yearlyCostPaise;
    if (r.urgency === 'soon') dueSoonCount += 1;
    if (!next || r.daysUntil < next.daysUntil) next = r;
  }

  return {
    monthlyTotalPaise,
    yearlyTotalPaise,
    activeCount: active.length,
    dueSoonCount,
    next,
  };
}
