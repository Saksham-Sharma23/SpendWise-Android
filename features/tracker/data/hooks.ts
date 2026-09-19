import { readDb } from '@/db/read';
import { useDbQuery, type DbQueryResult } from '@/lib/db/useDbQuery';
import { todayISO, type ISODate } from '@/lib/dates';
import { enrich, type EnrichedSubscription, type SubscriptionRow } from '../domain/renewal';
import { subscriptionListQuery } from './sql';

const EMPTY: EnrichedSubscription[] = [];

/**
 * Every live subscription, enriched with its next renewal and costs. Sorting
 * and filtering happen in JS on the enriched rows because both depend on the
 * computed renewal date — and the Tracker holds tens of rows, not thousands.
 */
export function useSubscriptions(today: ISODate = todayISO()): DbQueryResult<EnrichedSubscription[]> {
  return useDbQuery(
    async () => ((await subscriptionListQuery(readDb)) as SubscriptionRow[]).map((r) => enrich(r, today)),
    ['subscriptions', 'categories'],
    [today],
    EMPTY,
  );
}
