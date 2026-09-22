import { Keyboard, RotateCcw } from 'lucide-react-native';
import { useCallback, useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Line, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fonts, springs, useColors, withAlpha } from '@/lib/theme';
import { PressableScale } from './PressableScale';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * An alarm-clock dial for setting an amount.
 *
 * One full turn covers `maxPaise` in `stepPaise` notches, exactly as an alarm
 * face covers twelve hours in minutes. A budget has no natural maximum, so the
 * caller offers scales instead and the same angle means a different amount.
 *
 * The gesture runs entirely on the UI thread: the knob, the arc and the ticks
 * follow the thumb through shared values, and JS is told the new amount only
 * when it actually changes — not once per frame.
 */

export interface AmountDialProps {
  /** Current value in paise. */
  valuePaise: number;
  onChange: (paise: number) => void;
  maxPaise: number;
  stepPaise: number;
  /** Ticks drawn around the face. One per step is unreadable past ~60. */
  tickCount?: number;
  size?: number;
  /** Ring, knob and glow colour. */
  tone?: string;
  /** Rendered in the middle — the formatted amount, supplied by the caller. */
  children?: React.ReactNode;
  /** Shown when the value has wound past one full turn. */
  turns?: number;
  onPressCenter?: () => void;
  /** Announced to a screen reader, e.g. "Budget amount". */
  label?: string;
}

const TAU = Math.PI * 2;

export function AmountDial({
  valuePaise,
  onChange,
  maxPaise,
  stepPaise,
  tickCount = 60,
  size = 260,
  tone = colors.primary,
  children,
  turns = 0,
  onPressCenter,
  label = 'Amount',
}: AmountDialProps) {
  const colors = useColors();
  const radius = size / 2;
  const trackRadius = radius - 26;
  const circumference = TAU * trackRadius;

  /**
   * TOTAL rotation from zero, in radians, and the single source of truth
   * while the thumb is down. It may exceed 2π (wound past a full turn).
   *
   * The amount is DERIVED from it rather than accumulated alongside it. An
   * earlier version added each frame's movement to a running value and then
   * snapped that to a notch, which discarded the rounding remainder sixty
   * times a second: over a long drag the number fell steadily behind the
   * thumb, and on release the knob sprang back to the drifted value's angle.
   * With one source of truth the two cannot disagree.
   */
  const turn = useSharedValue(0);
  const dragging = useSharedValue(0);
  const pressing = useSharedValue(0);

  // Mirrors of the props, so the worklet reads current values without the
  // gesture being rebuilt (and losing its state) on every render.
  const max = useSharedValue(maxPaise);
  const step = useSharedValue(stepPaise);
  const emitted = useSharedValue(valuePaise);
  const lastAngle = useSharedValue(0);

  useEffect(() => {
    max.value = maxPaise;
    step.value = stepPaise;
  }, [maxPaise, stepPaise, max, step]);

  /**
   * Follow the value unless the thumb is down — otherwise the knob would
   * fight the finger as state round-trips through React.
   *
   * `emitted` is the de-duplication baseline for `onUpdate`: a frame crosses
   * to JS only when the snapped amount differs from it. So a DRAG OWNS IT,
   * and this must not touch it mid-gesture. It used to be assigned above the
   * guard, which reset the baseline to whatever React echoed back. When that
   * echo did not land exactly on the current step grid, the next frame saw a
   * difference again, emitted the same number, re-rendered, reset the
   * baseline — an unbounded emit → render → reset loop that React ended with
   * "Maximum update depth exceeded".
   */
  useEffect(() => {
    if (dragging.value === 1) return;
    emitted.value = valuePaise;
    turn.value = maxPaise > 0 ? (valuePaise / maxPaise) * TAU : 0;
  }, [valuePaise, maxPaise, turn, emitted, dragging]);

  const emit = useCallback((paise: number) => onChange(paise), [onChange]);

  /**
   * Built once, not per render. A fresh `Gesture.Pan()` each render makes
   * `GestureDetector` tear down and re-attach the handler mid-drag, which is
   * what the shared-value mirrors above exist to avoid — they keep every
   * current value reachable from the worklet, so nothing here needs a prop in
   * its closure and the gesture never has to be rebuilt.
   *
   * Only `emit` and `radius` come from React scope; the rest are shared
   * values, whose identities are stable for the component's lifetime.
   */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => {
          dragging.value = 1;
          pressing.value = withSpring(1, springs.press);
          lastAngle.value = Math.atan2(e.x - radius, -(e.y - radius));
        })
        .onUpdate((e) => {
          const dx = e.x - radius;
          const dy = e.y - radius;
          // Ignore the very centre: there the angle is noise, and a stray twitch
          // would send the amount flying.
          if (Math.hypot(dx, dy) < 28) return;

          const next = Math.atan2(dx, -dy);

          // The short way round, so crossing twelve o'clock is the small step it
          // looks like rather than a near-full turn backwards.
          let delta = next - lastAngle.value;
          if (delta > Math.PI) delta -= TAU;
          else if (delta < -Math.PI) delta += TAU;
          lastAngle.value = next;

          // The knob tracks the thumb exactly — no rounding applied to the angle,
          // so it never lags behind or springs away from where it was dropped.
          turn.value = Math.max(0, turn.value + delta);

          const raw = (turn.value / TAU) * max.value;
          const snapped = step.value > 0 ? Math.round(raw / step.value) * step.value : raw;

          if (snapped !== emitted.value) {
            emitted.value = snapped;
            // Cross to JS only when the number actually changes — roughly once
            // per notch, not sixty times a second.
            scheduleOnRN(emit, snapped);
          }
        })
        .onFinalize(() => {
          dragging.value = 0;
          pressing.value = withSpring(0, springs.settle);
          // Snap the knob onto the notch the amount landed on. It is at most half
          // a notch away, so this is a tiny correction rather than a journey.
          if (max.value > 0) turn.value = (emitted.value / max.value) * TAU;
        }),
    [emit, radius, dragging, pressing, lastAngle, turn, max, step, emitted],
  );

  const progress = useDerivedValue(() => {
    const a = turn.value % TAU;
    return a < 0 ? a + TAU : a;
  });

  const knob = useAnimatedStyle(() => {
    const a = progress.value;
    return {
      transform: [
        { translateX: Math.sin(a) * trackRadius },
        { translateY: -Math.cos(a) * trackRadius },
        { scale: 1 + pressing.value * 0.25 },
      ],
    };
  });

  const face = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pressing.value * 0.02 }],
  }));

  const glow = useAnimatedStyle(() => ({ opacity: 0.25 + pressing.value * 0.35 }));

  // The filled arc, as a dash offset — one interpolated number per frame
  // instead of a path rebuilt in JS.
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value / TAU),
  }));

  const ticks = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let i = 0; i < tickCount; i++) {
      const a = (i / tickCount) * TAU;
      const major = i % 5 === 0;
      const outer = trackRadius + 13;
      const inner = outer - (major ? 9 : 5);
      out.push({
        x1: radius + Math.sin(a) * inner,
        y1: radius - Math.cos(a) * inner,
        x2: radius + Math.sin(a) * outer,
        y2: radius - Math.cos(a) * outer,
        major,
      });
    }
    return out;
  }, [tickCount, trackRadius, radius]);

  return (
    <View style={{ width: size, height: size }}>
      {/* A soft pool of light under the face, brighter while turning. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: 12,
            top: 12,
            right: 12,
            bottom: 12,
            borderRadius: size,
            backgroundColor: withAlpha(tone, 0.07),
          },
          glow,
        ]}
      />

      <GestureDetector gesture={pan}>
        <Animated.View style={[{ width: size, height: size }, face]}>
          <Svg width={size} height={size}>
            <Defs>
              <LinearGradient id="dialArc" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={tone} stopOpacity={1} />
                <Stop offset="1" stopColor={tone} stopOpacity={0.55} />
              </LinearGradient>
            </Defs>

            <G>
              {ticks.map((t, i) => (
                <Line
                  key={i}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  stroke={t.major ? withAlpha(colors.foreground, 0.34) : withAlpha(colors.foreground, 0.14)}
                  strokeWidth={t.major ? 2 : 1}
                  strokeLinecap="round"
                />
              ))}
            </G>

            <Circle cx={radius} cy={radius} r={trackRadius} stroke={colors.elevated} strokeWidth={10} fill="none" />
            <AnimatedCircle
              cx={radius}
              cy={radius}
              r={trackRadius}
              stroke="url(#dialArc)"
              strokeWidth={10}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              animatedProps={arcProps}
              transform={`rotate(-90 ${radius} ${radius})`}
            />
          </Svg>

          {/* The knob. Positioned from the centre, so its transform is two
              trig calls on the UI thread and no layout. */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: radius - 13,
                top: radius - 13,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: tone,
                borderWidth: 3,
                borderColor: colors.background,
              },
              knob,
            ]}
          />

          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${label}. Tap to type a figure`}
              onPress={onPressCenter}
              disabled={!onPressCenter}
              scaleTo={0.96}
              className="items-center justify-center px-6"
            >
              {children}
              {turns > 0 ? (
                <View
                  className="mt-2 flex-row items-center gap-1 rounded-full px-2 py-0.5"
                  style={{ backgroundColor: withAlpha(tone, 0.16) }}
                >
                  <RotateCcw size={10} color={tone} />
                  <Text style={{ color: tone, fontFamily: fonts.semibold, fontSize: 10 }}>
                    +{turns} {turns === 1 ? 'turn' : 'turns'}
                  </Text>
                </View>
              ) : onPressCenter ? (
                <View className="mt-2 flex-row items-center gap-1 opacity-60">
                  <Keyboard size={11} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 10 }}>tap to type</Text>
                </View>
              ) : null}
            </PressableScale>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
