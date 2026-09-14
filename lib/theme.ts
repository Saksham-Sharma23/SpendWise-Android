import { useSyncExternalStore } from 'react';

/**
 * JS-side design tokens, in two palettes.
 *
 * Tailwind classes cover layout and some colour, but icons, SVG charts,
 * shadows and animated styles need raw values. These mirror global.css — if
 * you change a token there, change it here.
 *
 * ## Reading colours
 *
 * `useColors()` in a component; `colors` only where a hook cannot run
 * (module scope, worklets, a plain function). `colors` is a live proxy onto
 * the active palette, so it is never stale — but it does not re-render
 * anything by itself, which is why components use the hook.
 *
 * ## The light palette is not "dark inverted"
 *
 * Pure white (#FFF) as the page with white cards gives nothing to separate
 * them, so the ground is a warm off-white and cards are true white: the
 * card floats above the page instead of dissolving into it. Dark mode does
 * the reverse — a near-black page with lighter graphite cards. Both directions
 * mean "the card is nearer to you".
 *
 * The lime is the brand, but at 67% lightness it cannot carry white text and
 * glares as a large fill on a white page. Light mode uses a deeper olive of
 * the same hue: recognisably SpendWise, and readable with white text on it.
 */

export type ThemeName = 'light' | 'dark';

/** What the user chose: an explicit theme, or "whatever the phone says". */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * The theme actually shown. Pure and kept here rather than in themeStore.ts
 * so it can be tested in Node — themeStore imports React Native, which a
 * plain Node test cannot load.
 */
export function resolveTheme(preference: ThemePreference, system: ThemeName): ThemeName {
  return preference === 'system' ? system : preference;
}

export interface Palette {
  /** The page. */
  background: string;
  /** A surface above the page. */
  card: string;
  /** A surface above a card (inputs, chips, wells). */
  elevated: string;
  border: string;
  borderStrong: string;

  foreground: string;
  muted: string;
  subtle: string;

  /** The brand accent. Text on it is always `onPrimary`. */
  primary: string;
  onPrimary: string;
  /** A wash of the accent, for selected chips and soft fills. */
  primarySoft: string;
  primaryBorder: string;

  income: string;
  incomeSoft: string;
  expense: string;
  expenseSoft: string;
  warning: string;
  warningSoft: string;

  /** Shadow colour and opacity differ per theme — see `shadow`. */
  shadow: string;
  shadowOpacity: number;
}

const dark: Palette = {
  background: '#0A0A0B',
  card: '#151619',
  elevated: '#1C1D21',
  border: '#26272C',
  borderStrong: '#34353B',

  foreground: '#F4F4F5',
  muted: '#8B8D95',
  subtle: '#5C5E66',

  primary: '#D4F55E',
  onPrimary: '#0E1403',
  primarySoft: 'rgba(212, 245, 94, 0.10)',
  primaryBorder: 'rgba(212, 245, 94, 0.28)',

  income: '#3DDC97',
  incomeSoft: 'rgba(61, 220, 151, 0.12)',
  expense: '#F87171',
  expenseSoft: 'rgba(248, 113, 113, 0.12)',
  warning: '#F5B544',
  warningSoft: 'rgba(245, 181, 68, 0.12)',

  // On a near-black ground a black shadow is invisible; depth comes from the
  // lighter card instead, so shadows stay subtle.
  shadow: '#000000',
  shadowOpacity: 0.5,
};

const light: Palette = {
  // Warm off-white, not #FFF: it gives true-white cards something to sit on,
  // and reads softer under a bright screen.
  background: '#F7F6F3',
  card: '#FFFFFF',
  elevated: '#F1F0EC',
  border: '#E4E2DC',
  borderStrong: '#D2CFC7',

  // Near-black with a hint of warmth rather than #000 — pure black on white
  // is harsh at text sizes.
  foreground: '#1A1A18',
  muted: '#6B6A65',
  subtle: '#9A9891',

  // The lime, deepened until white text clears 4.5:1 on it (this lands at
  // 5.3:1) while keeping the hue. Large fills of the dark theme's lime would
  // glare on a white page, and it cannot carry white text at all.
  primary: '#5C7416',
  onPrimary: '#FFFFFF',
  primarySoft: 'rgba(92, 116, 22, 0.10)',
  primaryBorder: 'rgba(92, 116, 22, 0.30)',

  // Money colours are darkened too: the dark theme's mint and coral are built
  // to glow on black and turn pastel on white.
  //
  // They are also pulled APART in lightness, not just in hue. Equally dark
  // green and red differ only by hue, so red-green colourblind eyes see one
  // colour — and income and expense are the one pair in this app that must
  // never be confused. The green is deliberately the darker of the two.
  income: '#0B6B46',
  incomeSoft: 'rgba(11, 107, 70, 0.10)',
  expense: '#D14A21',
  expenseSoft: 'rgba(209, 74, 33, 0.10)',
  warning: '#9A6508',
  warningSoft: 'rgba(154, 101, 8, 0.12)',

  // On white, a soft grey-brown shadow is what makes a card read as raised.
  shadow: '#3A3730',
  shadowOpacity: 0.1,
};

export const PALETTES: Record<ThemeName, Palette> = { light, dark };

// ---------------------------------------------------------------------------
// The active theme
// ---------------------------------------------------------------------------

let active: ThemeName = 'dark';
const listeners = new Set<() => void>();

/** Set by the ThemeProvider; nothing else should call this. */
export function setActiveTheme(name: ThemeName): void {
  if (name === active) return;
  active = name;
  for (const l of listeners) l();
}

export function getActiveTheme(): ThemeName {
  return active;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The active palette, re-rendering the component when the theme changes.
 * Prefer this everywhere a hook is allowed.
 */
export function useColors(): Palette {
  return useSyncExternalStore(
    subscribe,
    () => PALETTES[active],
    () => PALETTES[active],
  );
}

/** The active theme name, re-rendering on change. */
export function useThemeName(): ThemeName {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => active,
  );
}

/**
 * A live view of the active palette.
 *
 * Every property read goes to the CURRENT theme, so module-level constants
 * built from it cannot freeze the palette they were defined under. It does
 * not trigger re-renders — use `useColors()` inside components.
 */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_t, prop: string) => PALETTES[active][prop as keyof Palette],
  ownKeys: () => Reflect.ownKeys(PALETTES[active]),
  getOwnPropertyDescriptor: (_t, prop) =>
    Object.getOwnPropertyDescriptor(PALETTES[active], prop) ?? {
      configurable: true,
      enumerable: true,
    },
}) as Palette;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

/** Add an alpha channel to a #RRGGBB colour. `alpha` is 0–1. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex.slice(0, 7)}${a}`;
}

/**
 * A card shadow that reads correctly in both themes.
 *
 * Dark mode barely uses one (a black shadow on a near-black page is
 * invisible); light mode needs it, because a white card on an off-white page
 * has almost no edge contrast to separate it.
 */
export function shadow(elevation: 'sm' | 'md' | 'lg' = 'md') {
  const p = PALETTES[active];
  const spec = { sm: [2, 4, 1], md: [6, 14, 3], lg: [12, 28, 8] }[elevation] as [number, number, number];
  return {
    shadowColor: p.shadow,
    shadowOffset: { width: 0, height: spec[0] },
    shadowRadius: spec[1],
    shadowOpacity: p.shadowOpacity,
    elevation: spec[2],
  };
}

/**
 * Decorative accent hues — the row icons on More, the violet on the renewals
 * card, and anything else that is colour-as-label rather than colour-as-data.
 *
 * The dark set is tuned to glow on near-black and is far too pale on white:
 * the lime reads 1.2:1 against a white card, which is close to invisible.
 * Each light value is the same hue taken down to at least 3:1.
 */
const ACCENT_HUES = {
  lime: { dark: '#D4F55E', light: '#5C7416' },
  violet: { dark: '#9B8CFF', light: '#5B45D6' },
  orange: { dark: '#E8833A', light: '#9C4F12' },
  blue: { dark: '#5EC8F5', light: '#0B6E96' },
  mint: { dark: '#3DDC97', light: '#0B6B46' },
  amber: { dark: '#F5B544', light: '#8A5A08' },
  grey: { dark: '#B0B3BC', light: '#5E5D58' },
  red: { dark: '#F87171', light: '#B3241F' },
} as const;

export type AccentHue = keyof typeof ACCENT_HUES;

/** A decorative hue in the active theme. */
export function accent(hue: AccentHue): string {
  return ACCENT_HUES[hue][active];
}

/** Every decorative hue, for the palette test. */
export const ACCENTS = ACCENT_HUES;

/** Springs shared by every pressable, so the whole app has one feel. */
export const springs = {
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  settle: { damping: 16, stiffness: 180 },
} as const;
