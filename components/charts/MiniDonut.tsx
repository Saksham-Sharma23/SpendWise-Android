import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, useColors, withAlpha } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** 0–1, already clamped by the caller (features/budgets/progress `fill`). */
  fill: number;
  color: string;
  size?: number;
  thickness?: number;
  children?: React.ReactNode;
}

/**
 * A small progress ring — the budgets screen's "how much is gone" at a glance.
 *
 * Drawn as a stroked circle with an animated dash offset rather than an arc
 * path: one interpolated number on the UI thread, no path rebuilt per frame.
 * It starts at 12 o'clock and fills clockwise, which is the direction people
 * read a dial.
 */
export function MiniDonut({ fill, color, size = 52, thickness = 5, children }: Props) {
  const colors = useColors();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(1, fill)), {
      duration: 650,
      easing: Easing.out(Easing.cubic),
    });
  }, [fill, progress]);

  const animated = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.elevated} strokeWidth={thickness} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animated}
          // -90° so it starts at the top instead of at 3 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** The ring colour for a budget state — one place, so the screen stays consistent. */
export function toneFor(state: 'under' | 'warning' | 'over' | 'paused'): string {
  switch (state) {
    case 'over':
      return colors.expense;
    case 'warning':
      return colors.warning;
    case 'paused':
      return colors.subtle;
    case 'under':
      return colors.primary;
  }
}

export function softToneFor(state: 'under' | 'warning' | 'over' | 'paused'): string {
  return withAlpha(toneFor(state), 0.14);
}
