/**
 * JS-side design tokens.
 *
 * Tailwind classes cover layout and most colour, but icons, SVG charts,
 * shadows and animated styles need raw values. These mirror global.css —
 * if you change a token there, change it here.
 */

export const colors = {
  background: '#0A0A0B',
  card: '#151619',
  elevated: '#1C1D21',
  border: '#26272C',
  borderStrong: '#34353B',

  foreground: '#F4F4F5',
  muted: '#8B8D95',
  subtle: '#5C5E66',

  /** The brand lime. Text on it is always `onPrimary`. */
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
} as const;

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

/** Springs shared by every pressable, so the whole app has one feel. */
export const springs = {
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  settle: { damping: 16, stiffness: 180 },
} as const;
