import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { MONTHS_SHORT, formatMonthYear } from '@/lib/dates';
import { formatINR, formatINRCompact } from '@/lib/money';
import { useMotion } from '@/lib/motion';
import { fonts, useColors } from '@/lib/theme';
import { labelStep, niceCeiling, pointX, resample, scrubIndex, smoothPath } from './geometry';
import type { TrendPoint } from './TrendChart';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

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

/** Element-wise blend of two equal-length series. Pure, so JS uses it too. */
function lerpArray(a: number[], b: number[], p: number): number[] {
  'worklet';
  const len = Math.min(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(a[i]! + (b[i]! - a[i]!) * p);
  return out;
}

/** Drop a line down to the baseline and close it, making it a fill. */
function closeArea(line: string, leftX: number, rightX: number, baseline: number): string {
  'worklet';
  if (line === '') return '';
  return `${line} L${rightX},${baseline} L${leftX},${baseline} Z`;
}

/** The y of the blended series at a fractional month index. */
function sampleY(from: number[], to: number[], p: number, at: number, top: number, plotH: number): number {
  'worklet';
  const len = Math.min(from.length, to.length);
  if (len === 0 || top <= 0) return PAD_TOP + plotH;
  const i = Math.max(0, Math.min(len - 1, Math.floor(at)));
  const j = Math.min(len - 1, i + 1);
  const f = Math.max(0, Math.min(1, at - i));
  const a = from[i]! + (to[i]! - from[i]!) * p;
  const b = from[j]! + (to[j]! - from[j]!) * p;
  return PAD_TOP + (1 - (a + (b - a) * f) / top) * plotH;
}

/**
 * Income and expense as stacked-free areas over months, with a touch scrubber.
 *
 * Purely presentational: it takes points already aggregated in SQL and never
 * queries anything (CLAUDE.md #5).
 *
 * **Changing range morphs the curve.** The chart used to be keyed on the point
 * count, so 3M → 24M unmounted one chart and faded in another: the shape blinked
 * out. Instead it keeps one set of paths and animates the VALUES behind them.
 * On a range change the outgoing shape is resampled onto the incoming month grid
 * (geometry.resample) and the two are blended by one `progress` value, along
 * with the axis ceiling — so the curve flows into its new shape and rescales at
 * the same time. Switching again mid-flight re-bases from wherever the blend had
 * got to, so it redirects instead of snapping.
 *
 * The scrubber runs on the UI thread. Dragging moves the guide and the two
 * dots in worklets, so it stays smooth while JS is busy re-rendering the
 * figures. JS hears about it only when the finger crosses into a different
 * month — at most `points.length` times per sweep, never once per frame.
 * The dots read the same blended series as the curve, so they ride it rather
 * than jumping ahead during a morph.
 *
 * Built on react-native-svg + Reanimated (already in the native build), like
 * TrendChart, so it ships over the air with no Skia rebuild.
 */
export function AreaChart({ points, selectedIndex, onSelect, height = 190 }: Props) {
  const colors = useColors();
  const motion = useMotion();
  const [width, setWidth] = useState(0);
  const n = points.length;
  const plotW = Math.max(0, width - PAD_X * 2);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const baseline = PAD_TOP + plotH;

  // One string identity for the data: the hook hands back a fresh array on
  // every refresh, and an unchanged range should not restart the morph.
  const signature = points.map((p) => `${p.month}:${p.incomePaise}:${p.expensePaise}`).join('|');
  const series = useMemo(
    () => ({
      income: points.map((p) => p.incomePaise),
      expense: points.map((p) => p.expensePaise),
      top: niceCeiling(Math.max(0, ...points.map((p) => Math.max(p.incomePaise, p.expensePaise)))),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  // --- the morph -----------------------------------------------------------
  const fromIncome = useSharedValue<number[]>(series.income);
  const toIncome = useSharedValue<number[]>(series.income);
  const fromExpense = useSharedValue<number[]>(series.expense);
  const toExpense = useSharedValue<number[]>(series.expense);
  const fromTop = useSharedValue(series.top);
  const toTop = useSharedValue(series.top);
  const progress = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // The first data is the starting shape, not a change.
      return;
    }
    const p = progress.value;
    const width2 = series.income.length;
    // Re-base on where the blend actually is, then project it onto the new
    // month grid so both ends of the next blend are the same length.
    fromIncome.value = resample(lerpArray(fromIncome.value, toIncome.value, p), width2);
    fromExpense.value = resample(lerpArray(fromExpense.value, toExpense.value, p), width2);
    fromTop.value = fromTop.value + (toTop.value - fromTop.value) * p;
    toIncome.value = series.income;
    toExpense.value = series.expense;
    toTop.value = series.top;
    progress.value = 0;
    progress.value = motion.reduced ? 1 : withTiming(1, { duration: motion.morph, easing: Easing.inOut(Easing.cubic) });
  }, [series, motion, progress, fromIncome, toIncome, fromExpense, toExpense, fromTop, toTop]);

  /** The blended ceiling, in paise. Read by the paths and the dots alike. */
  const topNow = useDerivedValue(() => fromTop.value + (toTop.value - fromTop.value) * progress.value);

  // Both curves, built once per frame and shared by the line and its fill.
  const paths = useDerivedValue(() => {
    const top = topNow.value;
    const inc = lerpArray(fromIncome.value, toIncome.value, progress.value);
    const exp = lerpArray(fromExpense.value, toExpense.value, progress.value);
    const len = inc.length;
    if (len === 0 || plotW <= 0 || top <= 0) return { income: '', expense: '' };
    const curve = (v: number[]) => {
      const xy: [number, number][] = [];
      for (let i = 0; i < len; i++) {
        xy.push([PAD_X + pointX(i, plotW, len), PAD_TOP + (1 - v[i]! / top) * plotH]);
      }
      return smoothPath(xy);
    };
    return { income: curve(inc), expense: curve(exp) };
  });

  const incomeLine = useAnimatedProps(() => ({ d: paths.value.income }));
  const expenseLine = useAnimatedProps(() => ({ d: paths.value.expense }));
  const incomeArea = useAnimatedProps(() => ({
    d: closeArea(paths.value.income, PAD_X, PAD_X + plotW, baseline),
  }));
  const expenseArea = useAnimatedProps(() => ({
    d: closeArea(paths.value.expense, PAD_X, PAD_X + plotW, baseline),
  }));

  // --- UI-thread scrubber state -------------------------------------------
  const guideX = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const lastIndex = useSharedValue(selectedIndex);

  // Follow a selection made from JS (initial render, range change, a11y).
  useEffect(() => {
    if (plotW === 0) return;
    lastIndex.value = selectedIndex;
    const x = PAD_X + pointX(selectedIndex, plotW, n);
    guideX.value = guideX.value === 0 || motion.reduced ? x : withSpring(x, GLIDE);
  }, [selectedIndex, plotW, n, guideX, lastIndex, motion.reduced]);

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
  const incomeDot = useAnimatedProps(() => ({
    cx: guideX.value,
    cy: sampleY(fromIncome.value, toIncome.value, progress.value, at.value, topNow.value, plotH),
  }));
  const expenseDot = useAnimatedProps(() => ({
    cx: guideX.value,
    cy: sampleY(fromExpense.value, toExpense.value, progress.value, at.value, topNow.value, plotH),
  }));

  const tip = useAnimatedStyle(() => ({
    opacity: scrubbing.value,
    transform: [
      { translateX: Math.max(0, Math.min(width - TIP_WIDTH, guideX.value - TIP_WIDTH / 2)) },
      { translateY: (1 - scrubbing.value) * 6 },
    ],
  }));

  const sel = points[selectedIndex];
  const step = labelStep(n);
  const xOf = (i: number) => PAD_X + pointX(i, plotW, n);

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
            <View style={{ flex: 1 }}>
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
                <Line
                  x1={PAD_X}
                  x2={width - PAD_X}
                  y1={baseline}
                  y2={baseline}
                  stroke={colors.border}
                  strokeWidth={1}
                />

                <AnimatedPath animatedProps={incomeArea} fill="url(#areaIncome)" />
                <AnimatedPath animatedProps={expenseArea} fill="url(#areaExpense)" />

                <AnimatedLine
                  animatedProps={guideProps}
                  y1={PAD_TOP - 6}
                  y2={baseline}
                  stroke={colors.borderStrong}
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                />

                <AnimatedPath
                  animatedProps={incomeLine}
                  stroke={colors.income}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                />
                <AnimatedPath
                  animatedProps={expenseLine}
                  stroke={colors.expense}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                />

                <AnimatedCircle
                  animatedProps={incomeDot}
                  r={5}
                  fill={colors.card}
                  stroke={colors.income}
                  strokeWidth={2.5}
                />
                <AnimatedCircle
                  animatedProps={expenseDot}
                  r={5}
                  fill={colors.card}
                  stroke={colors.expense}
                  strokeWidth={2.5}
                />
              </Svg>

              {/* The ceiling changes with the range; it cross-fades rather than
                  ticking through values the axis never actually showed. */}
              <View pointerEvents="none" style={{ position: 'absolute', left: PAD_X, top: 0 }}>
                <Animated.Text
                  key={series.top}
                  entering={FadeIn.duration(motion.base)}
                  exiting={FadeOut.duration(motion.quick)}
                  style={{ position: 'absolute', color: colors.subtle, fontFamily: fonts.medium, fontSize: 10 }}
                >
                  {formatINRCompact(series.top)}
                </Animated.Text>
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
            </View>
          ) : null}
        </View>
      </GestureDetector>

      {/* Month labels, anchored on the latest month so "now" is always labelled.
          The whole row cross-fades on a range change: its labels are absolutely
          positioned, so the outgoing set disturbs nothing on its way out. */}
      <View style={{ height: 16, marginTop: 6 }}>
        {width > 0 ? (
          <Animated.View
            key={n}
            entering={FadeIn.duration(motion.base)}
            exiting={FadeOut.duration(motion.quick)}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          >
            {points.map((p, i) =>
              (n - 1 - i) % step === 0 ? (
                <Text
                  key={p.month}
                  numberOfLines={1}
                  style={{
                    position: 'absolute',
                    left: xOf(i) - 22,
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
            )}
          </Animated.View>
        ) : null}
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
      <Text
        style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 11, fontVariant: ['tabular-nums'] }}
      >
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
