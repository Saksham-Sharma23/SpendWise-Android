import { forwardRef } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { fonts, useColors, type Palette } from '@/lib/theme';

/**
 * The app's one text component (R4-1). Screens say WHAT a piece of text is —
 * `variant`, `tone` — and never spell out a font family or a colour.
 *
 *   <Text variant="heading">Budgets</Text>
 *   <Text variant="caption" tone="muted">Resets on 1 Oct</Text>
 *   <Text variant="label" tone="subtle">Your data</Text>
 *   <Text weight="bold" size={21} tone="default">₹1,24,500</Text>
 *
 * The variants are the combinations the screens actually used, measured
 * before R4 (294 inline styles, 34 distinct weight/size pairs). The common
 * ones are named below; the long tail is spelled with `weight` + `size`, so
 * the migration moved no text by a single pixel. When a screen is redesigned,
 * move it onto the named variants.
 *
 * Nothing is applied that the props don't ask for: a bare `<Text>` renders
 * exactly like React Native's, so `className` (NativeWind) keeps working and
 * `style` is applied last, so it always wins.
 */

export type TextWeight = keyof typeof fonts;

export type TextVariant =
  /** 12 regular: helper lines, timestamps, footnotes. */
  | 'caption'
  /** 12 medium: small labels next to a figure. */
  | 'small'
  /** 13 medium: the default running text on cards. */
  | 'body'
  /** 15 semibold: row titles, button labels. */
  | 'bodyStrong'
  /** 16 semibold: card and section headings. */
  | 'heading'
  /** 30 bold: the screen title (components/layout/Screen). */
  | 'title'
  /** 12 semibold, uppercase, letter-spaced: section labels ("YOUR DATA"). */
  | 'label'
  /** Tabular figures, so digits don't jiggle as an amount changes. Combine with weight/size. */
  | 'amount';

const VARIANTS: Record<TextVariant, TextStyle> = {
  caption: { fontFamily: fonts.regular, fontSize: 12 },
  small: { fontFamily: fonts.medium, fontSize: 12 },
  body: { fontFamily: fonts.medium, fontSize: 13 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15 },
  heading: { fontFamily: fonts.semibold, fontSize: 16 },
  title: { fontFamily: fonts.bold, fontSize: 30 },
  label: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  amount: { fontVariant: ['tabular-nums'] },
};

/** Palette colours text may take. `default` is the foreground colour. */
export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'primary'
  | 'onPrimary'
  | 'income'
  | 'expense'
  | 'warning'
  | 'onAccent'
  | 'onBrightFill';

/** Palette keys that hold a colour (the palette also carries a few numbers). */
type ColorKey = { [K in keyof Palette]: Palette[K] extends string ? K : never }[keyof Palette];

const TONE_KEY: Record<TextTone, ColorKey> = {
  default: 'foreground',
  muted: 'muted',
  subtle: 'subtle',
  primary: 'primary',
  onPrimary: 'onPrimary',
  income: 'income',
  expense: 'expense',
  warning: 'warning',
  onAccent: 'onAccent',
  onBrightFill: 'onBrightFill',
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** Overrides the variant's weight. */
  weight?: TextWeight;
  /** Overrides the variant's size. */
  size?: number;
  tone?: TextTone;
  className?: string;
}

/**
 * The same weight/size as a style, for what can't be a `<Text>`: a TextInput,
 * an animated amount, a style handed to a third-party component.
 *
 *   <TextInput style={{ ...font('bold', 48), color: colors.foreground }} />
 */
export function font(weight: TextWeight, size?: number): TextStyle {
  return size === undefined ? { fontFamily: fonts[weight] } : { fontFamily: fonts[weight], fontSize: size };
}

export const Text = forwardRef<RNText, TextProps>(function Text({ variant, weight, size, tone, style, ...rest }, ref) {
  const colors = useColors();
  const own: TextStyle[] = [];
  if (variant) own.push(VARIANTS[variant]);
  if (weight) own.push({ fontFamily: fonts[weight] });
  if (size !== undefined) own.push({ fontSize: size });
  if (tone) own.push({ color: colors[TONE_KEY[tone]] });
  return <RNText ref={ref} {...rest} style={own.length ? [...own, style] : style} />;
});
