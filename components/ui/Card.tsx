import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { mix, shadow, useColors, useThemeName } from '@/lib/theme';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * `accent` is the lime-tinted hero surface (net balance). Use it once per
   * screen — its job is to say "look here first".
   */
  variant?: 'default' | 'accent';
  /** Colour of the soft corner glow. Defaults to lime on `accent`, none otherwise. */
  glow?: string;
}

export function Card({ children, className = '', style, variant = 'default', glow }: CardProps) {
  const colors = useColors();
  const theme = useThemeName();
  const accent = variant === 'accent';
  const glowColor = glow ?? (accent ? colors.primary : undefined);

  // The accent card is a tinted ground, so it has to be built FROM the theme:
  // dark mode deepens towards the accent's own hue, light mode lifts towards
  // it. A fixed near-black would simply vanish on a light page.
  //
  // OPAQUE on purpose. A translucent card lets anything painted behind it
  // (an Android elevation shadow, a parent's background) show through the
  // body, which is half of what made the Home net-balance card read as two
  // stacked grey boxes. `mix` pre-composites the tint onto the page instead.
  const accentBackground = theme === 'light' ? mix(colors.primary, colors.background, 0.07) : '#12150B';

  return (
    <View
      className={`overflow-hidden rounded-3xl border ${className}`}
      style={[
        {
          backgroundColor: accent ? accentBackground : colors.card,
          borderColor: accent ? colors.primaryBorder : colors.border,
        },
        // iOS only — on Android this contributes nothing (elevation is pinned
        // to 0 there, see lib/theme `shadow`), and the border above is what
        // separates a near-white card from the off-white page.
        shadow('sm'),
        style,
      ]}
    >
      {glowColor ? <Glow color={glowColor} /> : null}
      {children}
    </View>
  );
}

/** A radial light leak in the top-right corner — the web cards' soft sheen. */
function Glow({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow" cx="100%" cy="0%" rx="75%" ry="90%">
            <Stop offset="0" stopColor={color} stopOpacity={0.2} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
    </View>
  );
}
