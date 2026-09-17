import {
  daysBetween,
  getNextRenewal,
  getUrgency,
  toMonthlyPaise,
  toYearlyPaise,
  todayISO,
  type BillingCycle,
  type ISODate,
  type Urgency,
} from '../../lib/dates';
import { deterministicColor, deterministicIcon } from '../../lib/identity';

/**
 * `_enrich`, ported from the web app's `subscriptions.py`.
 *
 * Nothing here is stored: next renewal, days until, monthly cost and urgency
 * are all derived from `anchorDate` + `billingCycle` on every read. The design
 * is self-correcting — whatever the anchor, the answer is always the next real
 * occurrence — which is why the app needs no background job to keep renewals
 * current, and why this file is pure and exhaustively tested.
 */

export interface SubscriptionRow {
  id: number;
  name: string;
  amountPaise: number;
  billingCycle: BillingCycle;
  status: 'active' | 'paused' | 'cancelled';
  anchorDate: ISODate;
  categoryId: number | null;
  reminderDaysBefore: number;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

export interface EnrichedSubscription extends SubscriptionRow {
  nextRenewal: ISODate;
  daysUntilRenewal: number;
  /** The cycle amount normalised to a month, so a yearly and a weekly compare. */
  monthlyCostPaise: number;
  yearlyCostPaise: number;
  urgency: Urgency;
  /** Category look when set, otherwise derived from the name — never persisted. */
  icon: string;
  color: string;
}

export function enrich(row: SubscriptionRow, today: ISODate = todayISO()): EnrichedSubscription {
  const nextRenewal = getNextRenewal(row.anchorDate, row.billingCycle, today);
  const daysUntilRenewal = daysBetween(today, nextRenewal);
  const monthlyCostPaise = toMonthlyPaise(row.amountPaise, row.billingCycle);

  return {
    ...row,
    nextRenewal,
    daysUntilRenewal,
    monthlyCostPaise,
    // From the CHARGE, never ×12 of the rounded monthly equivalent (B3):
    // a yearly plan's yearly cost IS the charge, to the paisa.
    yearlyCostPaise: toYearlyPaise(row.amountPaise, row.billingCycle),
    // Only an active subscription renews; paused and cancelled read as muted.
    urgency: getUrgency(daysUntilRenewal, row.status === 'active'),
    icon: row.categoryIcon ?? deterministicIcon(row.name),
    color: row.categoryColor ?? deterministicColor(row.name),
  };
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
        const d = a.daysUntilRenewal - b.daysUntilRenewal;
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
    if (!next || r.daysUntilRenewal < next.daysUntilRenewal) next = r;
  }

  return {
    monthlyTotalPaise,
    yearlyTotalPaise,
    activeCount: active.length,
    dueSoonCount,
    next,
  };
}
