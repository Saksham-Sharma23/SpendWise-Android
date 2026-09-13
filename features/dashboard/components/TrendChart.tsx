import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Card } from '../../../components/ui/Card';
import { Segmented } from '../../../components/ui/Segmented';
import { MONTHS_SHORT, formatMonthYear, todayISO } from '../../../lib/dates';
import { formatINR, formatINRCompact } from '../../../lib/money';
import { colors, fonts } from '../../../lib/theme';
import { useMonthlyTrend, type TrendPoint } from '../queries';

const CHART_HEIGHT = 150;

type Range = '6' | '12';

/**
 * Income vs expense, one pair of bars per month.
 *
 * Tap a month to read its exact figures in the header; the other months dim
 * so the eye lands on the selection. Bars grow in with a stagger on mount and
 * re-spring whenever the data changes — which, with a live query, is every
 * time a transaction is written anywhere in the app.
 */
export function TrendChart() {
  const [range, setRange] = useState<Range>('6');
  const points = useMonthlyTrend(Number(range), todayISO());
  const [selected, setSelected] = useState<number | null>(null);

  // Default to the latest month; reset when the range changes length.
  const activeIndex = selected != null && selected < points.length ? selected : points.length - 1;
  const active = points[activeIndex];

  const max = useMemo(
    () => Math.max(1, ...points.map((p) => Math.max(p.incomePaise, p.expensePaise))),
    [points],
  );

  const empty = points.every((p) => p.incomePaise === 0 && p.expensePaise === 0);

  return (
    <Card className="p-5">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 17 }}>
            Income vs Expense
          </Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
            {active ? formatMonthYear(active.month) : `Last ${range} months`}
          </Text>
        </View>
        <View style={{ width: 104 }}>
          <Segmented
            size="sm"
            value={range}
            onChange={(r) => {
              setRange(r);
              setSelected(null);
            }}
            options={[
              { value: '6', label: '6M' },
              { value: '12', label: '12M' },
            ]}
          />
        </View>
      </View>

      <View className="mt-4 flex-row gap-3">
        <Figure label="Income" color={colors.income} paise={active?.incomePaise ?? 0} />
        <Figure label="Expense" color={colors.expense} paise={active?.expensePaise ?? 0} />
      </View>

      <View className="mt-5 flex-row items-end" style={{ height: CHART_HEIGHT }}>
        {points.map((p, i) => (
          <MonthBars
            key={p.month}
            point={p}
            index={i}
            max={max}
            dimmed={i !== activeIndex}
            compact={points.length > 6}
            onPress={() => setSelected(i)}
          />
        ))}
      </View>
      <View className="mt-2 flex-row">
        {points.map((p, i) => (
          <Text
            key={p.month}
            className="flex-1 text-center"
            style={{
              color: i === activeIndex ? colors.foreground : colors.subtle,
              fontFamily: i === activeIndex ? fonts.semibold : fonts.regular,
              fontSize: points.length > 6 ? 9 : 11,
            }}
          >
            {MONTHS_SHORT[Number(p.month.slice(5, 7)) - 1]}
          </Text>
        ))}
      </View>

      {empty ? (
        <Text
          className="mt-3 text-center"
          style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}
        >
          Your trend appears as you add transactions.
        </Text>
      ) : null}
    </Card>
  );
}

function Figure({ label, color, paise }: { label: string; color: string; paise: number }) {
  return (
    <View className="flex-1 rounded-2xl px-3 py-2.5" style={{ backgroundColor: colors.elevated }}>
      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>{label}</Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          color: colors.foreground,
          fontFamily: fonts.bold,
          fontSize: 16,
          marginTop: 3,
          fontVariant: ['tabular-nums'],
        }}
      >
        {paise >= 1_00_00_000 ? formatINRCompact(paise) : formatINR(paise, { whole: true })}
      </Text>
    </View>
  );
}

function MonthBars({
  point,
  index,
  max,
  dimmed,
  compact,
  onPress,
}: {
  point: TrendPoint;
  index: number;
  max: number;
  dimmed: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const width = compact ? 6 : 12;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatMonthYear(point.month)}: income ${formatINR(point.incomePaise, { whole: true })}, expense ${formatINR(point.expensePaise, { whole: true })}`}
      onPress={onPress}
      className="h-full flex-1 flex-row items-end justify-center"
      style={{ gap: compact ? 2 : 4 }}
    >
      <Bar value={point.incomePaise / max} color={colors.income} width={width} delay={index * 45} dimmed={dimmed} />
      <Bar value={point.expensePaise / max} color={colors.expense} width={width} delay={index * 45 + 30} dimmed={dimmed} />
    </Pressable>
  );
}

function Bar({
  value,
  color,
  width,
  delay,
  dimmed,
}: {
  value: number;
  color: string;
  width: number;
  delay: number;
  dimmed: boolean;
}) {
  const h = useSharedValue(0);
  const o = useSharedValue(1);

  useEffect(() => {
    // A zero month still shows a sliver, so the axis reads as continuous.
    h.value = withDelay(delay, withSpring(Math.max(3, value * CHART_HEIGHT), { damping: 15, stiffness: 120 }));
  }, [value, delay, h]);

  useEffect(() => {
    o.value = withTiming(dimmed ? 0.3 : 1, { duration: 200 });
  }, [dimmed, o]);

  const style = useAnimatedStyle(() => ({ height: h.value, opacity: o.value }));

  return (
    <Animated.View
      style={[{ width, borderRadius: width / 2, backgroundColor: color }, style]}
    />
  );
}
