import { useEffect, useMemo, useState } from 'react';
import { Text, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { MONTHS_SHORT, formatMonthYear } from '../../lib/dates';
import { formatINR, formatINRCompact } from '../../lib/money';
import { fonts, useColors } from '../../lib/theme';
import { labelStep, niceCeiling, pointX, scrubIndex, smoothPath } from './geometry';
import type { TrendPoint } from './TrendChart';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Room either side so the end dots are not clipped. */
const PAD_X = 10;
const PAD_TOP = 12;
const PAD_BOTTOM = 6;
const TIP_WIDTH = 142;
/** A quick, barely-bouncy glide between months. */
const GLIDE = { damping: 26, stiffness: 380, mass: 0.6 };

interface Props {
  points: TrendPoint[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  height?: number;
}

/**
 * Income and expense as stacked-free areas over months, with a touch scrubber.
 *
 * Purely presentational: it takes points already aggregated in SQL and never
 * queries anything (CLAUDE.md #5).
 *
 * The scrubber runs on the UI thread. Dragging moves the guide and the two
 * dots in worklets, so it stays smooth while JS is busy re-rendering the
 * figures. JS hears about it only when the finger crosses into a different
 * month — at most `points.length` times per sweep, never once per frame.
 * The dots ride the straight segment between neighbouring months while the
 * guide glides, so they never jump ahead of it.
 *
 * Built on react-native-svg + Reanimated (already in the native build), like
 * TrendChart, so it ships over the air with no Skia rebuild.
 */
export function AreaChart({ points, selectedIndex, onSelect, height = 190 }: Props) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const n = points.length;
  const plotW = Math.max(0, width - PAD_X * 2);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotH;

  const top = useMemo(
    () => niceCeiling(Math.max(0, ...points.map((p) => Math.max(p.incomePaise, p.expensePaise)))),
    [points],
  );

  const geometry = useMemo(() => {
    const xOf = (i: number) => PAD_X + pointX(i, plotW, n);
    const yOf = (paise: number) => PAD_TOP + (1 - paise / top) * plotH;
    const incomeYs = points.map((p) => yOf(p.incomePaise));
    const expenseYs = points.map((p) => yOf(p.expensePaise));
    const incomeLine = smoothPath(points.map((_, i) => [xOf(i), incomeYs[i]!]));
    const expenseLine = smoothPath(points.map((_, i) => [xOf(i), expenseYs[i]!]));
    const area = (line: string) => (n > 1 ? `${line} L${xOf(n - 1)},${baseline} L${xOf(0)},${baseline} Z` : '');
    return {
      incomeYs,
      expenseYs,
      incomeLine,
      expenseLine,
      incomeArea: area(incomeLine),
      expenseArea: area(expenseLine),
      xOf,
    };
  }, [points, plotW, plotH, top, n, baseline]);

  // --- UI-thread scrubber state -------------------------------------------
  const guideX = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const lastIndex = useSharedValue(selectedIndex);
  const ys = useSharedValue({ income: geometry.incomeYs, expense: geometry.expenseYs });

  useEffect(() => {
    ys.value = { income: geometry.incomeYs, expense: geometry.expenseYs };
  }, [geometry, ys]);

  // Follow a selection made from JS (initial render, range change, a11y).
  useEffect(() => {
    if (plotW === 0) return;
    lastIndex.value = selectedIndex;
    const x = PAD_X + pointX(selectedIndex, plotW, n);
    guideX.value = guideX.value === 0 ? x : withSpring(x, GLIDE);
  }, [selectedIndex, plotW, n, guideX, lastIndex]);

  const pan = useMemo(() => {
    const pick = (x: number) => {
      'worklet';
      const i = scrubIndex(x - PAD_X, plotW, n);
      if (i !== lastIndex.value) {
        lastIndex.value = i;
        guideX.value = withSpring(PAD_X + pointX(i, plotW, n), GLIDE);
        scheduleOnRN(onSelect, i);
      }
    };
    const drag = Gesture.Pan()
      // Horizontal intent scrubs; vertical intent is left to the page scroll.
      .activeOffsetX([-6, 6])
      .failOffsetY([-14, 14])
      .onStart((e) => {
        scrubbing.value = withTiming(1, { duration: 120 });
        pick(e.x);
      })
      .onUpdate((e) => pick(e.x))
      .onFinalize(() => {
        scrubbing.value = withTiming(0, { duration: 220 });
      });
    const tap = Gesture.Tap().onEnd((e) => pick(e.x));
    return Gesture.Race(drag, tap);
  }, [plotW, n, onSelect, lastIndex, guideX, scrubbing]);

  /** Fractional month index under the guide, for interpolating the dots. */
  const at = useDerivedValue(() => {
    if (n <= 1 || plotW <= 0) return 0;
    return Math.max(0, Math.min(n - 1, ((guideX.value - PAD_X) / plotW) * (n - 1)));
  });

  const guideProps = useAnimatedProps(() => ({ x1: guideX.value, x2: guideX.value }));
  const lerp = (arr: number[], f: number) => {
    'worklet';
    if (arr.length === 0) return baseline;
    const i = Math.floor(f);
    const a = arr[i] ?? arr[arr.length - 1]!;
    const b = arr[i + 1] ?? a;
    return a + (b - a) * (f - i);
  };
  const incomeDot = useAnimatedProps(() => ({ cx: guideX.value, cy: lerp(ys.value.income, at.value) }));
  const expenseDot = useAnimatedProps(() => ({ cx: guideX.value, cy: lerp(ys.value.expense, at.value) }));

  const tip = useAnimatedStyle(() => ({
    opacity: scrubbing.value,
    transform: [
      { translateX: Math.max(0, Math.min(width - TIP_WIDTH, guideX.value - TIP_WIDTH / 2)) },
      { translateY: (1 - scrubbing.value) * 6 },
    ],
  }));

  const sel = points[selectedIndex];
  const step = labelStep(n);

  const onA11y = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') onSelect(Math.min(n - 1, selectedIndex + 1));
    if (e.nativeEvent.actionName === 'decrement') onSelect(Math.max(0, selectedIndex - 1));
  };

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          style={{ height }}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Spending trend"
          accessibilityValue={sel ? { text: describe(sel) } : undefined}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onA11y}
        >
          {width > 0 && n > 0 ? (
            // Re-keyed on the range so switching cross-fades instead of snapping.
            <Animated.View key={n} entering={FadeIn.duration(280)} style={{ flex: 1 }}>
              <Svg width={width} height={height}>
                <Defs>
                  <LinearGradient id="areaIncome" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={colors.income} stopOpacity={0.26} />
                    <Stop offset="1" stopColor={colors.income} stopOpacity={0} />
                  </LinearGradient>
                  <LinearGradient id="areaExpense" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={colors.expense} stopOpacity={0.24} />
                    <Stop offset="1" stopColor={colors.expense} stopOpacity={0} />
                  </LinearGradient>
                </Defs>

                {/* Gridlines at the nice ceiling and its half, plus the baseline. */}
                {[0, 0.5].map((f) => (
                  <Line
                    key={f}
                    x1={PAD_X}
                    x2={width - PAD_X}
                    y1={PAD_TOP + f * plotH}
                    y2={PAD_TOP + f * plotH}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeDasharray="4 5"
                  />
                ))}
                <Line x1={PAD_X} x2={width - PAD_X} y1={baseline} y2={baseline} stroke={colors.border} strokeWidth={1} />

                <Path d={geometry.incomeArea} fill="url(#areaIncome)" />
                <Path d={geometry.expenseArea} fill="url(#areaExpense)" />

                <AnimatedLine
                  animatedProps={guideProps}
                  y1={PAD_TOP - 6}
                  y2={baseline}
                  stroke={colors.borderStrong}
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                />

                <Path d={geometry.incomeLine} stroke={colors.income} strokeWidth={2.5} fill="none" strokeLinecap="round" />
                <Path d={geometry.expenseLine} stroke={colors.expense} strokeWidth={2.5} fill="none" strokeLinecap="round" />

                <AnimatedCircle animatedProps={incomeDot} r={5} fill={colors.card} stroke={colors.income} strokeWidth={2.5} />
                <AnimatedCircle animatedProps={expenseDot} r={5} fill={colors.card} stroke={colors.expense} strokeWidth={2.5} />
              </Svg>

              <View pointerEvents="none" style={{ position: 'absolute', left: PAD_X, top: 0 }}>
                <Text style={{ color: colors.subtle, fontFamily: fonts.medium, fontSize: 10 }}>
                  {formatINRCompact(top)}
                </Text>
              </View>

              {sel ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: TIP_WIDTH,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.borderStrong,
                      backgroundColor: colors.elevated,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    },
                    tip,
                  ]}
                >
                  <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 12 }}>
                    {formatMonthYear(sel.month)}
                  </Text>
                  <TipRow color={colors.income} label="In" paise={sel.incomePaise} />
                  <TipRow color={colors.expense} label="Out" paise={sel.expensePaise} />
                </Animated.View>
              ) : null}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {/* Month labels, anchored on the latest month so "now" is always labelled. */}
      <View style={{ height: 16, marginTop: 6 }}>
        {width > 0
          ? points.map((p, i) =>
              (n - 1 - i) % step === 0 ? (
                <Text
                  key={p.month}
                  numberOfLines={1}
                  style={{
                    position: 'absolute',
                    left: geometry.xOf(i) - 22,
                    width: 44,
                    textAlign: 'center',
                    color: i === selectedIndex ? colors.foreground : colors.subtle,
                    fontFamily: i === selectedIndex ? fonts.semibold : fonts.regular,
                    fontSize: 10,
                  }}
                >
                  {monthLabel(p.month, n > 12)}
                </Text>
              ) : null,
            )
          : null}
      </View>
    </View>
  );
}

function TipRow({ color, label, paise }: { color: string; label: string; paise: number }) {
  const colors = useColors();
  return (
    <View className="mt-1 flex-row items-center justify-between">
      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>{label}</Text>
      </View>
      <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 11, fontVariant: ['tabular-nums'] }}>
        {formatINR(paise, { whole: true })}
      </Text>
    </View>
  );
}

/** 'Mar', or 'Jan 25' where a long range crosses into a new year. */
function monthLabel(key: string, withYear: boolean): string {
  const m = Number(key.slice(5, 7));
  const name = MONTHS_SHORT[m - 1]!;
  return withYear && m === 1 ? `${name} ${key.slice(2, 4)}` : name;
}

function describe(p: TrendPoint): string {
  return `${formatMonthYear(p.month)}: income ${formatINR(p.incomePaise, { whole: true })}, expense ${formatINR(p.expensePaise, { whole: true })}`;
}
