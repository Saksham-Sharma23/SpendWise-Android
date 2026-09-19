import { create } from 'zustand';

/**
 * Dev-only A/B switches for the R5-4 measurements: turn one suspected cost
 * off, scroll the 50k ledger with Perf Monitor open, compare.
 *
 * - `swipeable`: every ledger row mounts a ReanimatedSwipeable (a pan handler
 *   and two animated views). Off renders the row plain, which is the ceiling
 *   on what mounting it only on touch could save.
 * - `blur`: the glass tab bar's live backdrop blur, re-rendered every frame
 *   the page under it scrolls. Off leaves the tinted glass without the blur.
 *
 * In memory, never persisted, and only the dev harness flips them (it is
 * itself `__DEV__`-guarded); the setter refuses in release too (CLAUDE.md
 * #17), so a release build always ships both switched on.
 */
interface PerfFlags {
  swipeable: boolean;
  blur: boolean;
  toggle: (flag: 'swipeable' | 'blur') => void;
}

export const usePerfFlags = create<PerfFlags>((set) => ({
  swipeable: true,
  blur: true,
  toggle: (flag) => {
    if (!__DEV__) return;
    set((s) => ({ [flag]: !s[flag] }));
  },
}));
