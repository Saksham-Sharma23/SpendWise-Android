import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** How far the element shrinks while held. 0.97 suits cards, 0.9 suits icons. */
  scaleTo?: number;
}

/**
 * The app's one touchable.
 *
 * Every tappable surface dips slightly under the finger and springs back on
 * release. It runs on the UI thread, so it stays smooth even while a live
 * query re-renders the screen underneath.
 */
export function PressableScale({
  children,
  style,
  className,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      className={className}
      onPressIn={(e) => {
        scale.value = withSpring(scaleTo, springs.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, springs.press);
        onPressOut?.(e);
      }}
      style={[animated, style, disabled ? { opacity: 0.45 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
}
