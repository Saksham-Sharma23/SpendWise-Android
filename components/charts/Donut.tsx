import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useColors } from '../../lib/theme';
import { donutArcs, hitArc, type Arc } from './geometry';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface DonutSlice {
  key: string;
  value: number;
  color: string;
}

interface Props {
  slices: DonutSlice[];
  selectedKey: string | null;
  /** Tapping a segment selects it; tapping it again, or the hole, clears. */
  onSelect: (key: string | null) => void;
  size?: number;
  thickness?: number;
  /** Rendered in the hole — the total, or the selected slice's figures. */
  children?: ReactNode;
}

/**
 * A category donut. Presentational: it takes finished totals and draws them.
 *
 * Each segment is a stroked circle with a fixed dash (its share of the ring)
 * rotated to its start angle. Only numbers animate — stroke width and opacity
 * for selection, one scale/rotation for the entrance — so nothing rebuilds a
 * path per frame. Taps are hit-tested by angle (geometry.hitArc), because
 * every segment is the same circle and SVG's own hit-testing would always
 * hand the touch to whichever was drawn last.
 */
export function Donut({ slices, selectedKey, onSelect, size = 188, thickness = 22, children }: Props) {
  const colors = useColors();
  const arcs = useMemo(() => donutArcs(slices.map((s) => s.value)), [slices]);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Entrance: the ring turns in and settles whenever the set of slices changes.
  const signature = slices.map((s) => `${s.key}:${s.value}`).join('|');
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = 0;
    enter.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) });
  }, [signature, enter]);

  const ring = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ rotate: `${(enter.value - 1) * 60}deg` }, { scale: 0.9 + enter.value * 0.1 }],
  }));

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((e) => {
          const i = hitArc(e.x, e.y, size, thickness, arcs);
          const key = i >= 0 ? slices[i]?.key ?? null : null;
          onSelect(key != null && key !== selectedKey ? key : null);
        }),
    [size, thickness, arcs, slices, selectedKey, onSelect],
  );

  return (
    <GestureDetector gesture={tap}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: size, height: size }, ring]}>
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.elevated} strokeWidth={thickness} fill="none" />
            {slices.map((s, i) => (
              <Segment
                key={s.key}
                arc={arcs[i]!}
                color={s.color}
                size={size}
                radius={radius}
                circumference={circumference}
                thickness={thickness}
                state={selectedKey == null ? 'idle' : selectedKey === s.key ? 'on' : 'off'}
              />
            ))}
          </Svg>
        </Animated.View>
        {children}
      </View>
    </GestureDetector>
  );
}

function Segment({
  arc,
  color,
  size,
  radius,
  circumference,
  thickness,
  state,
}: {
  arc: Arc;
  color: string;
  size: number;
  radius: number;
  circumference: number;
  thickness: number;
  state: 'idle' | 'on' | 'off';
}) {
  const width = useSharedValue(thickness);
  const opacity = useSharedValue(1);

  useEffect(() => {
    width.value = withTiming(state === 'on' ? thickness + 7 : thickness, { duration: 220 });
    opacity.value = withTiming(state === 'off' ? 0.32 : 1, { duration: 220 });
  }, [state, thickness, width, opacity]);

  const props = useAnimatedProps(() => ({ strokeWidth: width.value, strokeOpacity: opacity.value }));

  if (arc.length <= 0) return null;
  const c = size / 2;
  return (
    <AnimatedCircle
      animatedProps={props}
      cx={c}
      cy={c}
      r={radius}
      stroke={color}
      fill="none"
      strokeDasharray={[arc.length * circumference, circumference]}
      // Start at 12 o'clock, then turn to this segment's start angle.
      transform={`rotate(${-90 + arc.start * 360} ${c} ${c})`}
    />
  );
}
