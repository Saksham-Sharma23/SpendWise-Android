import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '@/lib/motion';
import { formatINR, type FormatOptions } from '@/lib/money';

interface Props {
  paise: number;
  style?: StyleProp<TextStyle>;
  options?: FormatOptions;
  durationMs?: number;
  /**
   * False jumps straight to the value. Use it where the figure changes many
   * times a second — dragging the chart scrubber crosses a month every few
   * frames, and a count-up there reads as lag, not as motion.
   */
  animate?: boolean;
  /** Where the figure sits in its row. Centre it here rather than with the parent's `items-center`. */
  align?: 'left' | 'center' | 'right';
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** The smallest a figure shrinks to fit its column, as `minimumFontScale` did. */
const MIN_SCALE = 0.6;

/** Style keys that place the figure, and so belong on the wrapper rather than the text. */
const OUTER_KEYS = [
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginHorizontal',
  'marginVertical',
  'alignSelf',
  'flex',
] as const;

/**
 * A rupee figure that counts to its new value instead of jumping.
 *
 * The count runs entirely on the UI thread (B16). A shared value tweens the
 * paise and a worklet `formatINR` writes each frame straight into a read-only
 * TextInput's `text`, so a change costs ONE React render, not ~42: the old
 * version called setState on every frame for 700 ms, and Home mounts six of
 * these. Every frame is still a real, correctly grouped amount, rounded to
 * whole paise, and the count settles on the exact target.
 *
 * It does not count while its screen is unfocused (the new value just lands)
 * or when "Remove animations" is on.
 *
 * TextInput cannot `adjustsFontSizeToFit`, so crore-scale totals are fitted by
 * hand: an invisible Text measures the target at full size and the font
 * shrinks by the ratio, down to 60%, rather than wrapping mid-number.
 */
export function AnimatedAmount({ paise, style, options, durationMs = 700, animate = true, align = 'left' }: Props) {
  const { reduced } = useMotion();
  const focused = useIsFocused();
  const still = !animate || reduced || !focused;

  const shown = useSharedValue(paise);
  const whole = options?.whole ?? false;
  const bare = options?.bare ?? false;
  const signed = options?.signed ?? false;

  useEffect(() => {
    if (still) {
      cancelAnimation(shown);
      shown.value = paise;
      return;
    }
    shown.value = withTiming(paise, { duration: durationMs, easing: Easing.out(Easing.cubic) });
  }, [paise, durationMs, still, shown]);

  const animatedProps = useAnimatedProps(() => {
    // `text` is not in TextInput's typings, but Reanimated sets it natively.
    return { text: formatINR(Math.round(shown.value), { whole, bare, signed }) } as unknown as Partial<TextInputProps>;
  });

  const target = formatINR(paise, { whole, bare, signed });

  // --- Fitting -------------------------------------------------------------
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    if ((OUTER_KEYS as readonly string[]).includes(k)) outer[k] = v;
    else inner[k] = v;
  }
  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
  const letterSpacing = typeof flat.letterSpacing === 'number' ? flat.letterSpacing : undefined;

  const [room, setRoom] = useState(0);
  const [natural, setNatural] = useState(0);
  const scale = room > 0 && natural > room ? Math.max(MIN_SCALE, room / natural) : 1;

  const textStyle: TextStyle = {
    fontVariant: ['tabular-nums'],
    ...(inner as TextStyle),
    fontSize: fontSize * scale,
    ...(letterSpacing !== undefined ? { letterSpacing: letterSpacing * scale } : null),
  };

  return (
    <View
      style={[{ alignSelf: 'stretch' }, outer]}
      onLayout={(e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="text"
      accessibilityLabel={target}
    >
      <AnimatedTextInput
        editable={false}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        caretHidden
        contextMenuHidden
        underlineColorAndroid="transparent"
        defaultValue={target}
        animatedProps={animatedProps}
        style={[textStyle, { padding: 0, margin: 0, textAlign: align }]}
      />
      {/* Measures the target at full size, off to the side and invisible. */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={styles.probe}>
        <Text
          style={[{ fontVariant: ['tabular-nums'] }, inner as TextStyle, { alignSelf: 'flex-start' }]}
          onLayout={(e: LayoutChangeEvent) => setNatural(e.nativeEvent.layout.width)}
        >
          {target}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  probe: { position: 'absolute', top: 0, left: 0, width: 10_000, opacity: 0 },
});
