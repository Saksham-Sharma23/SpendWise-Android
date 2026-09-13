import { useEffect, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, springs } from '../../lib/theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Pill colour when selected. Defaults to the brand lime. */
  tint?: string;
  /** Text colour on the selected pill. */
  onTint?: string;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

/**
 * A pill switcher whose highlight slides between options, like the web
 * app's Bar/Line and All/Income/Expense toggles.
 */
export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: Props<T>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segment = width > 0 ? (width - 8) / options.length : 0;

  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withSpring(index * segment, springs.settle);
  }, [index, segment, x]);

  const active = options[index];
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const pad = size === 'sm' ? 'py-1.5' : 'py-2.5';

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      className="flex-row rounded-full border p-1"
      style={{ backgroundColor: colors.card, borderColor: colors.border }}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: 4,
              width: segment,
              borderRadius: 999,
              backgroundColor: active?.tint ?? colors.primary,
            },
            pill,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            className={`flex-1 items-center ${pad}`}
          >
            <Text
              style={{
                fontFamily: on ? fonts.semibold : fonts.medium,
                fontSize: size === 'sm' ? 12 : 14,
                color: on ? (o.onTint ?? colors.onPrimary) : colors.muted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
