import { colorScheme } from 'nativewind';
import { useEffect, type ReactNode } from 'react';

import { useSystemThemeSync } from '@/lib/themeStore';

/**
 * Applies the stored theme preference to both colour systems.
 *
 * The app has two: Tailwind classes resolve through NativeWind's colour
 * scheme (`bg-card`, `text-primary`), and raw JS values come from
 * lib/theme.ts. `lib/themeStore.ts` already drives the JS side at module
 * load, so nothing paints in the wrong palette; this keeps NativeWind in
 * step and re-resolves when the OS scheme changes.
 *
 * NativeWind is given the PREFERENCE, not the resolved theme. On Android
 * `colorScheme.set` sets the app's night mode (AppCompat, scoped to this app —
 * the phone's own dark-mode toggle is never touched): 'light'/'dark' force it,
 * 'system' maps to MODE_NIGHT_FOLLOW_SYSTEM. Passing the resolved theme meant
 * the app was ALWAYS forced, so choosing System never lifted the override and
 * the app could not see the phone's real setting again.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { preference } = useSystemThemeSync();

  useEffect(() => {
    colorScheme.set(preference);
  }, [preference]);

  return <>{children}</>;
}
