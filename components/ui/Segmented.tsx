import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { useMotion } from '../../lib/motion';
import { fonts, springs, useColors } from '../../lib/theme';
import { PressableScale } from './PressableScale';

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

/** How far the pill elongates along its travel, as a fraction of a segment. */
const STRETCH = 0.1;

/**
 * A pill switcher whose highlight slides between options, like the web
 * app's Bar/Line and All/Income/Expense toggles.
 *
 * One shared value carries everything: `pos`, a FRACTIONAL option index that
 * springs to whatever was pressed. The pill rides it, the pill's colour
 * interpolates along it where options carry their own tint (All → Income →
 * Expense sweeps lime into red), and each label recolours by its distance
 * from it — so the text turns as the pill reaches it rather than the instant
 * you press, which is what made the old version feel disconnected.
 *
 * While travelling, the pill stretches along its direction of travel and
 * settles back to its exact width. It is the oldest trick in animation and
 * the reason the movement reads as one object rather than a jump.
 */
export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: Props<T>) {
  const colors = useColors();
  const { reduced } = useMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segment = width > 0 ? (width - 8) / options.length : 0;

  const pos = useSharedValue(index);
  const target = useSharedValue(index);
  // The pill is PLACED, not animated, the first time it has a width to sit in
  // and whenever that width changes. Animating from a stale geometry made it
  // glide in from the left edge on mount and lurch after a re-layout.
  const placed = useRef(-1);

  useEffect(() => {
    target.value = index;
    const snap = placed.current !== segment || reduced;
    placed.current = segment;
    if (snap) pos.value = index;
    else pos.value = withSpring(index, springs.pill);
  }, [index, segment, reduced, pos, target]);

  const tintKey = options.map((o) => o.tint ?? '').join('|');
  const tints = useMemo(
    () => options.map((o) => o.tint ?? colors.primary),
    // Keyed on the tints themselves, so a new options array of the same
    // colours does not rebuild the worklet on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tintKey, colors.primary],
  );
  const stops = useMemo(() => tints.map((_, i) => i), [tints]);

  const pill = useAnimatedStyle(() => {
    // Full stretch mid-flight, none at rest — |pos − target| is the distance
    // still to travel, which the spring drives to zero.
    const travel = Math.min(1, Math.abs(pos.value - target.value));
    return {
      transform: [{ translateX: pos.value * segment }, { scaleX: 1 + travel * STRETCH }],
      backgroundColor:
        tints.length > 1 ? interpolateColor(pos.value, stops, tints) : (tints[0] ?? colors.primary),
    };
  });

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
            { position: 'absolute', top: 4, bottom: 4, left: 4, width: segment, borderRadius: 999 },
            pill,
          ]}
        />
      ) : null}
      {options.map((o, i) => (
        <Option
          key={o.value}
          label={o.label}
          index={i}
          pos={pos}
          selected={o.value === value}
          onTint={o.onTint ?? colors.onPrimary}
          size={size}
          pad={pad}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

/**
 * One option. Its own component so the colour worklet is a real hook and not
 * a hook inside a `.map` — call sites do change their option lists (the
 * ledger's type filter, the expense form's split methods).
 */
function Option({
  label,
  index,
  pos,
  selected,
  onTint,
  size,
  pad,
  onPress,
}: {
  label: string;
  index: number;
  pos: SharedValue<number>;
  selected: boolean;
  onTint: string;
  size: 'sm' | 'md';
  pad: string;
  onPress: () => void;
}) {
  const colors = useColors();
  // Read the palette out here: a worklet may not reach through the proxy
  // useColors() returns.
  const rest = colors.muted;

  const text = useAnimatedStyle(() => ({
    // 1 when the pill is exactly over this label, 0 once it is a full segment
    // away — so the colour turns with the pill passing, not with the press.
    color: interpolateColor(Math.max(0, 1 - Math.abs(pos.value - index)), [0, 1], [rest, onTint]),
  }));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      scaleTo={0.94}
      className={`flex-1 items-center ${pad}`}
    >
      <Animated.Text
        style={[
          {
            fontFamily: selected ? fonts.semibold : fonts.medium,
            fontSize: size === 'sm' ? 12 : 14,
          },
          text,
        ]}
      >
        {label}
      </Animated.Text>
    </PressableScale>
  );
}
