import { create } from 'zustand';

import { EMPTY_FILTERS, type TransactionFilters } from './data/filters';

/**
 * Ledger filter state.
 *
 * This is one of the three things CLAUDE.md earmarks Zustand for, and it
 * earns it for a specific reason: the filter sheet is a separate ROUTE from
 * the list, so the two cannot share component state. Everything that is
 * actual data still lives in SQLite — this store holds only the predicate.
 *
 * `search` is deliberately NOT here. It lives in the list screen, because it
 * changes on every keystroke and each change re-runs a live query; routing it
 * through a shared store would re-render the filter sheet on every character.
 */

interface FilterState {
  filters: TransactionFilters;
  setFilters: (f: TransactionFilters) => void;
  patch: (p: Partial<TransactionFilters>) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  filters: EMPTY_FILTERS,
  setFilters: (filters) => set({ filters }),
  patch: (p) => set((s) => ({ filters: { ...s.filters, ...p } })),
  reset: () => set({ filters: EMPTY_FILTERS }),
}));
