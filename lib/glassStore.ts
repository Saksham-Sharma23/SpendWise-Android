import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';

import { parseGlassStyle, type GlassStyle } from './theme';

/**
 * The glass style preference: Frosted or Liquid (Settings → Glass effect).
 *
 * Kept exactly like the theme preference (lib/themeStore.ts), for the same
 * reasons: it is a UI preference, not a record, and MMKV reads SYNCHRONOUSLY
 * at startup. An async read would paint the bar frosted for a frame and then
 * swap it — the flash a preference exists to avoid.
 *
 * Same MMKV id as the theme ('spendwise-prefs'). MMKV hands back the one
 * native store for an id however many instances ask for it, and sharing it
 * means both preferences travel together through Android auto-backup
 * (`files/mmkv/` is not excluded — plugins/withBackupRules.js).
 *
 * Whether liquid glass can actually be SHOWN is a separate question —
 * clear glass with no blur behind it is unreadable — and it is answered where
 * the glass is drawn (`BLUR_RENDERS`, components/layout/glass.tsx). This only
 * remembers what was chosen.
 */

export type { GlassStyle } from './theme';

const storage = createMMKV({ id: 'spendwise-prefs' });
const KEY = 'glass_style';

function readStyle(): GlassStyle {
  try {
    return parseGlassStyle(storage.getString(KEY));
  } catch {
    // A corrupt or unavailable store must not stop the app booting.
    return 'frosted';
  }
}

interface GlassStoreState {
  style: GlassStyle;
  setStyle: (style: GlassStyle) => void;
}

export const useGlassStore = create<GlassStoreState>((set) => ({
  style: readStyle(),

  setStyle: (style) => {
    set({ style });
    try {
      storage.set(KEY, style);
    } catch {
      // Not worth interrupting the user: the style still applies this session.
    }
  },
}));
