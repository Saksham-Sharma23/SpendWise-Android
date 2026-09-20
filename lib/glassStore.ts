import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';

/**
 * How glassy the tab bar is: "glass" or "solid".
 *
 * Stored in MMKV, like the theme preference and for the same two reasons: it
 * is a UI preference rather than a record (CLAUDE.md, Stack), and MMKV reads
 * SYNCHRONOUSLY at startup, so the bar paints the right way on the first
 * frame instead of flipping once an async read lands.
 *
 * The setting exists because the honest answer to "is glass readable?" is
 * "it depends what is behind it". A dense ledger, a light wallpaper or just
 * a preference for flat surfaces are all good reasons to turn it off, and
 * guessing on the user's behalf is worse than asking.
 */

export type GlassPreference = 'glass' | 'solid';

const storage = createMMKV({ id: 'spendwise-prefs' });
const KEY = 'glass_preference';

function readPreference(): GlassPreference {
  try {
    const raw = storage.getString(KEY);
    return raw === 'solid' ? 'solid' : 'glass';
  } catch {
    // A corrupt or unavailable store must not stop the app booting.
    return 'glass';
  }
}

interface GlassStoreState {
  preference: GlassPreference;
  setPreference: (preference: GlassPreference) => void;
}

export const useGlassStore = create<GlassStoreState>((set) => ({
  preference: readPreference(),
  setPreference: (preference) => {
    try {
      storage.set(KEY, preference);
    } catch {
      // Losing the preference across restarts is survivable; crashing is not.
    }
    set({ preference });
  },
}));

/** True when the tab bar should render as glass rather than a solid capsule. */
export function useGlassEnabled(): boolean {
  return useGlassStore((s) => s.preference) === 'glass';
}
