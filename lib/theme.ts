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
 * them, so the ground is a faint sage off-white and cards are true white: the
 * card floats above the page instead of dissolving into it. Dark mode does
 * the reverse — a near-black page with lighter graphite cards. Both directions
 * mean "the card is nearer to you".
 *
 * The lime is the brand, but at 67% lightness it cannot carry white text and
 * glares as a large fill on a white page. Light mode uses a leaf green from
 * the same family: recognisably SpendWise, readable with white text on it,
 * and readable AS text on a card.
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

/**
 * The theme state and its two transitions — pure, so the rules are tested in
 * Node (lib/themeStore.ts applies them).
 *
 * ## Why the phone's theme cannot simply be read from `Appearance`
 *
 * Choosing Light or Dark forces the APP's night mode (Android
 * `AppCompatDelegate.setDefaultNightMode`). That override is scoped to this
 * app, and your phone's own dark-mode setting is untouched. But while
 * it is in force, `Appearance.getColorScheme()` and its change events report
 * the app's FORCED scheme, not the phone's. Taking those reports as "the
 * phone's theme" is what made System stop following the phone: after picking
 * Light, System stayed light on a dark phone.
 *
 * So a report only counts as the phone's theme while the preference is
 * System, and switching back to System lifts the override (ThemeProvider
 * passes 'system' to NativeWind, which maps to MODE_NIGHT_FOLLOW_SYSTEM).
 */
export interface ThemeState {
  preference: ThemePreference;
  /** The phone's theme, as last reliably known. */
  system: ThemeName;
  /** What is on screen. */
  resolved: ThemeName;
}

export function applyPreference(state: ThemeState, preference: ThemePreference): ThemeState {
  if (preference !== 'system') {
    return { preference, system: state.system, resolved: preference };
  }
  if (state.preference === 'system') return state;
  // Leaving a forced theme. `state.system` may be stale (reports were ignored
  // while forced), and the phone's real value is not readable until the
  // override lifts. Two cases, both handled:
  //   - the phone matches what is on screen: lifting the override changes
  //     nothing, Android sends no event, and this guess is simply correct;
  //   - it does not: lifting the override changes the effective scheme,
  //     Android reports the real value, and applySystemReport takes it.
  return { preference, system: state.resolved, resolved: state.resolved };
}

export function applySystemReport(state: ThemeState, reported: ThemeName): ThemeState {
  // While Light or Dark is forced, the report is the app's own override.
  if (state.preference !== 'system') return state;
  if (state.system === reported && state.resolved === reported) return state;
  return { ...state, system: reported, resolved: reported };
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

  /**
   * Text and icons drawn ON a saturated fill — an income/expense pill, a
   * swipe-to-delete action, a selected colour swatch.
   *
   * NOT `background`. The two coincide in dark mode (a near-black glyph on a
   * bright mint or coral reads perfectly), which is why call sites reached
   * for `background` — but in light mode `background` is off-white, and
   * off-white on the light palette's deepened coral falls to 4.12:1, under
   * AA. These colours are chosen against the fills each theme actually uses.
   */
  onAccent: string;

  /**
   * A glyph drawn on a FIXED bright fill — one the theme does not choose, such
   * as a `CATEGORY_COLORS` swatch or a user's own category colour.
   *
   * Constant across themes on purpose. Those fills stay bright in light mode,
   * so the glyph must stay dark: white clears 3:1 on only 11 of the 18
   * swatches (it fails on the lime at 1.23:1), while near-black clears all 18.
   */
  onBrightFill: string;

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

  // The dark palette's fills are bright (mint #3DDC97, coral #F87171), so a
  // near-black glyph is the readable choice: 11.2:1 and 7.2:1.
  onAccent: '#0A0A0B',
  onBrightFill: '#0A0A0B',

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
  // A faint cool sage, not #FFF and not beige: it gives true-white cards
  // something to sit on, and the green cast ties the neutrals to the brand —
  // on the old warm beige the green read as khaki.
  background: '#F4F7F2',
  card: '#FFFFFF',
  elevated: '#ECF1E8',
  border: '#DFE6DA',
  borderStrong: '#C9D2C3',

  // A green-black ink rather than #000 — pure black on white is harsh at
  // text sizes, and the tint keeps text in the same family as the ground.
  foreground: '#121A15',
  muted: '#56635B',
  subtle: '#8A958E',

  // A leaf green in the lime's family, deep enough that white text clears
  // 4.5:1 on it (5.06:1) AND that it reads as text on a white card (also
  // 5.06:1) — primary is used both ways. The dark theme's lime cannot carry
  // white text and glares as a fill on a white page.
  primary: '#3F7D0B',
  onPrimary: '#FFFFFF',
  primarySoft: 'rgba(63, 125, 11, 0.10)',
  primaryBorder: 'rgba(63, 125, 11, 0.28)',

  // The light palette's fills are deep (leaf green, emerald, crimson),
  // so white is the readable glyph — and the reason this token exists at all.
  onAccent: '#FFFFFF',
  // Deliberately the same near-black as dark mode: see the field's comment.
  onBrightFill: '#0A0A0B',

  // Money colours are darkened too: the dark theme's mint and coral are built
  // to glow on black and turn pastel on white.
  //
  // They are also pulled APART in lightness, not just in hue. Equally dark
  // green and red differ only by hue, so red-green colourblind eyes see one
  // colour — and income and expense are the one pair in this app that must
  // never be confused. The emerald is deliberately the darker of the two
  // (1.47:1 between them), and a different hue from primary (163° vs 93°) so
  // a net balance in primary is never read as income.
  income: '#08654A',
  incomeSoft: 'rgba(8, 101, 74, 0.10)',
  // A crimson-coral: white text on an expense pill clears 4.5:1 (4.80). Not
  // taken darker: past this the red and green converge in lightness and the
  // income/expense pair stops being distinguishable.
  expense: '#D2383E',
  expenseSoft: 'rgba(210, 56, 62, 0.10)',
  // Amber, kept orange-leaning so it sits clear of both the crimson and the greens.
  warning: '#B25E09',
  warningSoft: 'rgba(178, 94, 9, 0.12)',

  // On white, a soft green-ink shadow is what makes a card read as raised.
  shadow: '#1B2A1F',
  shadowOpacity: 0.08,
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

/**
 * Blend `color` into `over` at `amount` (0–1) and return an OPAQUE #RRGGBB.
 *
 * The opaque counterpart to `withAlpha`. Use it for a tinted SURFACE: a
 * translucent background lets whatever sits behind the view show through it,
 * which on Android includes an elevation shadow — the Home net-balance card
 * read as two stacked grey boxes for exactly that reason. Keep `withAlpha`
 * for overlays that are *meant* to let content through.
 */
export function mix(color: string, over: string, amount: number): string {
  const a = Math.min(1, Math.max(0, amount));
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const blended = [0, 1, 2].map((i) =>
    Math.round(channel(color, i) * a + channel(over, i) * (1 - a))
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${blended.join('')}`;
}

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
 *
 * ## Why this is platform-split
 *
 * `shadowColor` / `shadowOffset` / `shadowRadius` / `shadowOpacity` are
 * **iOS-only**. Android ignores all four and draws from `elevation` alone,
 * which is not a soft blur but a shadow cast from the view's OUTLINE.
 *
 * Android can only derive that outline when the view has an opaque, uniform
 * background. A card that is translucent (the accent card is a 7% tint) or
 * clips a child (`overflow: 'hidden'` + a glow `<Svg>`) gives it nothing to
 * work from, so it falls back to filling the whole shadow area — painting a
 * hard grey-olive rectangle AROUND the card. That is exactly what the Home
 * net-balance card showed: a #C6C7BE box wrapping a #ECEDE4 one.
 *
 * So `elevation` is pinned to 0. The iOS props stay (they are inert on
 * Android and correct on iOS), and depth on Android comes from the border
 * every Card already draws — which costs nothing and cannot misrender.
 *
 * This module is imported by Node tests, so it must not import `Platform`
 * from react-native; hence the constant rather than a platform branch.
 */
export function shadow(elevation: 'sm' | 'md' | 'lg' = 'md') {
  const p = PALETTES[active];
  const spec = { sm: [2, 4, 1], md: [6, 14, 3], lg: [12, 28, 8] }[elevation] as [number, number, number];
  return {
    shadowColor: p.shadow,
    shadowOffset: { width: 0, height: spec[0] },
    shadowRadius: spec[1],
    shadowOpacity: p.shadowOpacity,
    // Android only. 0 because an elevation shadow on a translucent or
    // clipping view renders as a hard rectangle — see the note above.
    elevation: 0,
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
  lime: { dark: '#D4F55E', light: '#3F7D0B' },
  violet: { dark: '#9B8CFF', light: '#6547DD' },
  orange: { dark: '#E8833A', light: '#C2540A' },
  blue: { dark: '#5EC8F5', light: '#0B72B0' },
  mint: { dark: '#3DDC97', light: '#0C8158' },
  amber: { dark: '#F5B544', light: '#9C6A06' },
  grey: { dark: '#B0B3BC', light: '#5C6A62' },
  red: { dark: '#F87171', light: '#C7303A' },
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
