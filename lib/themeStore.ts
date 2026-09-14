import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';

import { resolveTheme, setActiveTheme, type ThemeName, type ThemePreference } from './theme';

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

interface ThemeState {
  preference: ThemePreference;
  /** What the OS currently reports. Only consulted when preference is 'system'. */
  system: ThemeName;
  /** What is actually on screen. */
  resolved: ThemeName;
  setPreference: (preference: ThemePreference) => void;
  /** Called by the provider when the OS scheme changes. */
  setSystem: (system: ThemeName) => void;
}

const initialPreference = readPreference();
const initialSystem = systemTheme();

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  system: initialSystem,
  resolved: resolveTheme(initialPreference, initialSystem),

  setPreference: (preference) => {
    const resolved = resolveTheme(preference, get().system);
    set({ preference, resolved });
    setActiveTheme(resolved);
    try {
      storage.set(KEY, preference);
    } catch {
      // Not worth interrupting the user: the theme still applies this session.
    }
  },

  setSystem: (system) => {
    const resolved = resolveTheme(get().preference, system);
    set({ system, resolved });
    setActiveTheme(resolved);
  },
}));

// Apply the stored choice before the first render, so nothing paints in the
// wrong palette.
setActiveTheme(resolveTheme(initialPreference, initialSystem));

/**
 * Keeps the store in step with the OS setting. Mounted once, at the root.
 * Returns the resolved theme so the root can key its own styling off it.
 */
export function useSystemThemeSync(): ThemeName {
  const setSystem = useThemeStore((s) => s.setSystem);
  const resolved = useThemeStore((s) => s.resolved);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, [setSystem]);

  return resolved;
}
