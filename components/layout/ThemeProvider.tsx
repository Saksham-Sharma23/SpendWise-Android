import { colorScheme } from 'nativewind';
import { useEffect, type ReactNode } from 'react';

import { useSystemThemeSync } from '../../lib/themeStore';

/**
 * Applies the stored theme preference to both colour systems.
 *
 * The app has two: Tailwind classes resolve through NativeWind's colour
 * scheme (`bg-card`, `text-primary`), and raw JS values come from
 * lib/theme.ts. `lib/themeStore.ts` already drives the JS side at module
 * load, so nothing paints in the wrong palette; this keeps NativeWind in
 * step and re-resolves when the OS scheme changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const resolved = useSystemThemeSync();

  useEffect(() => {
    colorScheme.set(resolved);
  }, [resolved]);

  return <>{children}</>;
}
