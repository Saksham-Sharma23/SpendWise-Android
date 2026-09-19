import type { BenchQuery } from '@/db/benchmark';
import { EMPTY_FILTERS } from './filters';
import { transactionQueries } from './queries';

/** The ledger's shipped queries, for the dev harness benchmark. */
export function transactionBenchQueries(): BenchQuery[] {
  const searching = { ...EMPTY_FILTERS, search: 'swiggy' };
  return [
    { name: 'ledger page (40)', build: () => transactionQueries.ledger(EMPTY_FILTERS, 40) },
    { name: 'ledger summary (all)', build: () => transactionQueries.summary(EMPTY_FILTERS) },
    { name: 'search page ("swiggy")', build: () => transactionQueries.ledger(searching, 40) },
    { name: 'search summary ("swiggy")', build: () => transactionQueries.summary(searching) },
  ];
}
