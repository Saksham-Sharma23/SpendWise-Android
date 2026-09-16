import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';

import {
  applyPreference,
  applySystemReport,
  resolveTheme,
  setActiveTheme,
  type ThemeName,
  type ThemePreference,
} from './theme';

/**
 * The theme preference: System, Light or Dark.
 *
 * Stored in MMKV rather than the database because it is a UI preference, not
 * a record (CLAUDE.md, Stack), and because MMKV reads SYNCHRONOUSLY at
 * startup. An async read would paint one frame of the wrong theme before the
 * answer arrived — the flash every themed app is judged by.
 */

export type { ThemePreference } from './theme';
export { resolveTheme } from './theme';

const storage = createMMKV({ id: 'spendwise-prefs' });
const KEY = 'theme_preference';

function readPreference(): ThemePreference {
  try {
    const raw = storage.getString(KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
  } catch {
    // A corrupt or unavailable store must not stop the app booting.
    return 'system';
  }
}

function systemTheme(): ThemeName {
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

interface ThemeStoreState {
  preference: ThemePreference;
  /** The phone's theme, as last reliably known. Only consulted when preference is 'system'. */
  system: ThemeName;
  /** What is actually on screen. */
  resolved: ThemeName;
  setPreference: (preference: ThemePreference) => void;
  /**
   * Called by the provider when Android reports a colour scheme. Ignored while
   * Light or Dark is forced — see `applySystemReport` in lib/theme.ts.
   */
  setSystem: (system: ThemeName) => void;
}

const initialPreference = readPreference();
const initialSystem = systemTheme();

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  preference: initialPreference,
  system: initialSystem,
  resolved: resolveTheme(initialPreference, initialSystem),

  setPreference: (preference) => {
    const next = applyPreference(get(), preference);
    set(next);
    setActiveTheme(next.resolved);
    try {
      storage.set(KEY, preference);
    } catch {
      // Not worth interrupting the user: the theme still applies this session.
    }
  },

  setSystem: (system) => {
    const current = get();
    const next = applySystemReport(current, system);
    if (next === current) return;
    set(next);
    setActiveTheme(next.resolved);
  },
}));

// Apply the stored choice before the first render, so nothing paints in the
// wrong palette.
setActiveTheme(resolveTheme(initialPreference, initialSystem));

/**
 * Keeps the store in step with the OS setting. Mounted once, at the root.
 * Returns the preference (what to hand NativeWind) and the resolved theme.
 */
export function useSystemThemeSync(): { preference: ThemePreference; resolved: ThemeName } {
  const setSystem = useThemeStore((s) => s.setSystem);
  const preference = useThemeStore((s) => s.preference);
  const resolved = useThemeStore((s) => s.resolved);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, [setSystem]);

  return { preference, resolved };
}
