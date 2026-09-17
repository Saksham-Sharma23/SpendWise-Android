// Type-only, deliberately: a value import would make Node resolve lib/theme.ts
// (and React with it) when scripts/gen-theme-css.ts runs. The palettes are
// passed in instead.
import type { Palette, ThemeName } from './theme';

/**
 * Generates global.css from the palettes in lib/theme.ts.
 *
 * Until now the CSS variables were a hand-kept copy of the same colours, with
 * a comment asking whoever edited one to remember the other (TASKS2 5C). Two
 * copies of a palette drift; this makes one of them a build artifact.
 *
 * Run `npm run theme:css` after changing a colour. A test
 * (lib/__tests__/themeCss.test.ts) fails if the checked-in file is stale, so
 * the drift cannot reach a build.
 *
 * Pure and RN-free, like the rest of lib/theme.ts, so both the script and the
 * test can run it in Node.
 */

/** `#RRGGBB` → the `H S% L%` triple Tailwind's `hsl(var(--x))` expects. */
export function hexToHslTriple(hex: string): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.slice(0, 6);

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Which palette colour each CSS variable is.
 *
 * Tailwind's shadcn-style names and this app's palette names do not line up
 * one to one — `--muted` is a SURFACE in Tailwind but `muted` is body text
 * here — so the mapping is written out rather than guessed. This table is the
 * only place the two vocabularies meet.
 */
export const CSS_TOKENS: { css: string; token: keyof Palette; note?: string }[] = [
  { css: '--background', token: 'background' },
  { css: '--foreground', token: 'foreground' },
  { css: '--card', token: 'card' },
  { css: '--card-foreground', token: 'foreground' },
  { css: '--elevated', token: 'elevated' },
  { css: '--muted', token: 'elevated', note: 'Tailwind muted = a surface, not text' },
  { css: '--muted-foreground', token: 'muted', note: 'the app’s `muted` IS the text colour' },
  { css: '--border', token: 'border' },
  { css: '--input', token: 'borderStrong' },
  { css: '--primary', token: 'primary' },
  { css: '--primary-foreground', token: 'onPrimary' },
  { css: '--secondary', token: 'elevated' },
  { css: '--secondary-foreground', token: 'foreground' },
  { css: '--accent', token: 'elevated' },
  { css: '--accent-foreground', token: 'primary' },
  { css: '--success', token: 'income' },
  { css: '--success-foreground', token: 'onAccent' },
  { css: '--warning', token: 'warning' },
  { css: '--warning-foreground', token: 'onAccent' },
  { css: '--destructive', token: 'expense' },
  { css: '--destructive-foreground', token: 'onAccent' },
  { css: '--ring', token: 'primary' },
];

const RADIUS = '1rem';

const HEADER = `@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * GENERATED FILE — do not edit by hand.
 *
 * Every colour below comes from the palettes in lib/theme.ts; run
 * \`npm run theme:css\` after changing one. lib/themeCss.ts holds the mapping
 * from these Tailwind variable names to the app's own token names, and
 * lib/__tests__/themeCss.test.ts fails if this file is out of date.
 *
 * \`:root\` is LIGHT and \`.dark:root\` is DARK, which is how NativeWind's class
 * strategy resolves them; the app sets the colour scheme from the stored
 * preference (lib/themeStore.ts).
 */`;

function block(selector: string, palette: Palette, label: string): string {
  const lines = CSS_TOKENS.map(({ css, token, note }) => {
    const value = palette[token];
    const comment = note ? `    /* ${note} */\n` : '';
    return `${comment}    ${css}: ${hexToHslTriple(String(value))};`;
  });
  return [
    `  /* ${label} */`,
    `  ${selector} {`,
    ...lines,
    `    --radius: ${RADIUS};`,
    '  }',
  ].join('\n');
}

export function buildThemeCss(palettes: Record<ThemeName, Palette>): string {
  return [
    HEADER,
    '',
    '@layer base {',
    block(':root', palettes.light, 'light — mirrors `light` in lib/theme.ts'),
    '',
    block('.dark:root', palettes.dark, 'dark — mirrors `dark` in lib/theme.ts'),
    '}',
    '',
  ].join('\n');
}
