import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { msUntilNextMidnight, todayISO, type ISODate } from './dates';

/**
 * A "today" that moves.
 *
 * `todayISO()` read during render freezes the day at mount: leave the app open
 * past midnight and "this month", the Today chip and the trend window all go
 * stale. This store holds today's date and refreshes it
 *   - when the app returns to the foreground, and
 *   - at the next local midnight (then re-arms for the one after).
 * Components subscribe with `useToday()` and re-render only when the day
 * actually changes.
 */

interface TodayState {
  today: ISODate;
  refresh: () => void;
}

export const useTodayStore = create<TodayState>((set, get) => ({
  today: todayISO(),
  refresh: () => {
    const next = todayISO();
    if (next !== get().today) set({ today: next });
  },
}));

let clockStarted = false;
function startClock(): void {
  if (clockStarted) return;
  clockStarted = true;
  const arm = () => {
    setTimeout(() => {
      useTodayStore.getState().refresh();
      arm();
    }, msUntilNextMidnight(new Date()));
  };
  arm();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') useTodayStore.getState().refresh();
  });
}

/** Today's date as 'YYYY-MM-DD', updated at midnight and on resume. */
export function useToday(): ISODate {
  useEffect(startClock, []);
  return useTodayStore((s) => s.today);
}
