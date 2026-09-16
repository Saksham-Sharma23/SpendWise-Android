import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { MONTHS_SHORT, formatMonthYear } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { colors, fonts, useColors } from '../../lib/theme';
import { smoothPath } from './geometry';

export { smoothPath } from './geometry';

/**
 * Income vs expense over months — the reusable chart for Home (Phase 3) and
 * Insights (Phase 5).
 *
 * Purely presentational: it takes finished points (already aggregated in SQL,
 * CLAUDE.md #5) and never queries anything. Built on Reanimated views (bars)
 * and react-native-svg (line), both already in the native build, so it needs
 * no Skia/victory-native rebuild. If charts are ever swapped, only this file
 * changes.
 *
 * Tapping a month selects it: the chart dims the other months (bars) or
 * draws a guide and dots (line), and reports the index so the caller can
 * show the figures.
 */

export interface TrendPoint {
  /** 'YYYY-MM' */
  month: string;
  incomePaise: number;
  expensePaise: number;
}

export type TrendMode = 'bar' | 'line';

interface Props {
  points: TrendPoint[];
  mode: TrendMode;
  selectedIndex: number;
  onSelect: (index: number) => void;
  height?: number;
}

export function TrendChart({ points, mode, selectedIndex, onSelect, height = 150 }: Props) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const max = useMemo(
    () => Math.max(1, ...points.map((p) => Math.max(p.incomePaise, p.expensePaise))),
    [points],
  );
  const compact = points.length > 6;

  return (
    <View>
      <View
        style={{ height }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        {/* Re-keyed on mode so switching cross-fades instead of snapping. */}
        <Animated.View key={mode} entering={FadeIn.duration(260)} style={{ flex: 1 }}>
          {mode === 'bar' ? (
            <View className="flex-1 flex-row items-end">
              {points.map((p, i) => (
                <MonthBars
                  key={p.month}
                  point={p}
                  index={i}
                  max={max}
                  height={height}
                  dimmed={i !== selectedIndex}
                  compact={compact}
                  onPress={() => onSelect(i)}
                />
              ))}
            </View>
          ) : width > 0 ? (
            <LineMode
              points={points}
              max={max}
              width={width}
              height={height}
              selectedIndex={selectedIndex}
              onSelect={onSelect}
            />
          ) : null}
        </Animated.View>
      </View>

      <View className="mt-2 flex-row">
        {points.map((p, i) => (
          <Text
            key={p.month}
            className="flex-1 text-center"
            style={{
              color: i === selectedIndex ? colors.foreground : colors.subtle,
              fontFamily: i === selectedIndex ? fonts.semibold : fonts.regular,
              fontSize: compact ? 9 : 11,
            }}
          >
            {MONTHS_SHORT[Number(p.month.slice(5, 7)) - 1]}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------

function MonthBars({
  point,
  index,
  max,
  height,
  dimmed,
  compact,
  onPress,
}: {
  point: TrendPoint;
  index: number;
  max: number;
  height: number;
  dimmed: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const barWidth = compact ? 6 : 12;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={describe(point)}
      onPress={onPress}
      className="h-full flex-1 flex-row items-end justify-center"
      style={{ gap: compact ? 2 : 4 }}
    >
      <Bar value={point.incomePaise / max} height={height} color={colors.income} width={barWidth} delay={index * 45} dimmed={dimmed} />
      <Bar value={point.expensePaise / max} height={height} color={colors.expense} width={barWidth} delay={index * 45 + 30} dimmed={dimmed} />
    </Pressable>
  );
}

function Bar({
  value,
  height,
  color,
  width,
  delay,
  dimmed,
}: {
  value: number;
  height: number;
  color: string;
  width: number;
  delay: number;
  dimmed: boolean;
}) {
  const h = useSharedValue(0);
  const o = useSharedValue(1);

  useEffect(() => {
    // A zero month still shows a sliver, so the axis reads as continuous.
    h.value = withDelay(delay, withSpring(Math.max(3, value * height), { damping: 15, stiffness: 120 }));
  }, [value, delay, height, h]);

  useEffect(() => {
    o.value = withTiming(dimmed ? 0.3 : 1, { duration: 200 });
  }, [dimmed, o]);

  const style = useAnimatedStyle(() => ({ height: h.value, opacity: o.value }));
  return <Animated.View style={[{ width, borderRadius: width / 2, backgroundColor: color }, style]} />;
}

// ---------------------------------------------------------------------------
// Line
// ---------------------------------------------------------------------------

const PAD_TOP = 10;
const PAD_BOTTOM = 4;

function LineMode({
  points,
  max,
  width,
  height,
  selectedIndex,
  onSelect,
}: {
  points: TrendPoint[];
  max: number;
  width: number;
  height: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const colors = useColors();
  const n = points.length;
  const slot = width / Math.max(1, n);
  const x = (i: number) => slot * (i + 0.5);
  const y = (paise: number) => PAD_TOP + (1 - paise / max) * (height - PAD_TOP - PAD_BOTTOM);

  const income: [number, number][] = points.map((p, i) => [x(i), y(p.incomePaise)]);
  const expense: [number, number][] = points.map((p, i) => [x(i), y(p.expensePaise)]);
  const incomeLine = smoothPath(income);
  const expenseLine = smoothPath(expense);
  const baseline = height - PAD_BOTTOM;
  const area = (line: string) =>
    n > 0 ? `${line} L${x(n - 1)},${baseline} L${x(0)},${baseline} Z` : '';

  const sel = points[selectedIndex];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.income} stopOpacity={0.28} />
            <Stop offset="1" stopColor={colors.income} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.expense} stopOpacity={0.22} />
            <Stop offset="1" stopColor={colors.expense} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        <Path d={area(incomeLine)} fill="url(#incomeFill)" />
        <Path d={area(expenseLine)} fill="url(#expenseFill)" />

        {sel ? (
          <Line
            x1={x(selectedIndex)}
            x2={x(selectedIndex)}
            y1={PAD_TOP / 2}
            y2={baseline}
            stroke={colors.borderStrong}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        <Path d={incomeLine} stroke={colors.income} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <Path d={expenseLine} stroke={colors.expense} strokeWidth={2.5} fill="none" strokeLinecap="round" />

        {sel ? (
          <>
            <Circle cx={x(selectedIndex)} cy={y(sel.incomePaise)} r={5} fill={colors.card} stroke={colors.income} strokeWidth={2.5} />
            <Circle cx={x(selectedIndex)} cy={y(sel.expensePaise)} r={5} fill={colors.card} stroke={colors.expense} strokeWidth={2.5} />
          </>
        ) : null}
      </Svg>

      {/* Invisible tap targets, one per month, over the SVG. */}
      <View className="absolute inset-0 flex-row">
        {points.map((p, i) => (
          <Pressable
            key={p.month}
            accessibilityRole="button"
            accessibilityLabel={describe(p)}
            onPress={() => onSelect(i)}
            className="h-full flex-1"
          />
        ))}
      </View>
    </View>
  );
}

function describe(p: TrendPoint): string {
  return `${formatMonthYear(p.month)}: income ${formatINR(p.incomePaise, { whole: true })}, expense ${formatINR(p.expensePaise, { whole: true })}`;
}
