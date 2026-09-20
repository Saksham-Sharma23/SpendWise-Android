import { useCallback, useState } from 'react';
import { View, type TextStyle } from 'react-native';

import { AreaChart } from '@/components/charts/AreaChart';
import { AnimatedAmount } from '@/components/ui/AnimatedAmount';
import { Card } from '@/components/ui/Card';
import { formatMonthYear, type ISODate } from '@/lib/dates';
import { formatINRCompact } from '@/lib/money';
import { useColors } from '@/lib/theme';
import { useSpendingTrend } from '../data/hooks';
import { Text, font } from '@/components/ui/Text';
import { StatFigure } from '@/components/ui/StatFigure';

/**
 * The spending-trend card: the scrubbable area chart plus the figures for
 * whichever month is under the finger. The header figures update once per
 * month crossed, not per frame — the chart does the per-frame work on the UI
 * thread (components/charts/AreaChart).
 */
export function SpendingTrend({ months, today }: { months: number; today: ISODate }) {
  const colors = useColors();
  const { data: points, status } = useSpendingTrend(months, today);
  // The selection remembers which range it was made in. A new range starts on
  // its latest month in the SAME render — resetting it in an effect let the
  // scrubber glide to the old index first, then jump.
  // `source` says whether the figures below should count up to their new value
  // or simply arrive: a finger sweeping the chart crosses months faster than
  // any count-up can finish.
  const [selected, setSelected] = useState<{ months: number; index: number; source: 'range' | 'scrub' }>({
    months,
    index: months - 1,
    source: 'range',
  });

  // Stable, so the chart's gesture is not rebuilt on every render.
  const onSelect = useCallback((index: number) => setSelected({ months, index, source: 'scrub' }), [months]);

  const fresh = selected.months !== months;
  const wanted = fresh ? months - 1 : selected.index;
  const index = Math.min(Math.max(0, wanted), Math.max(0, points.length - 1));
  const active = points[index];
  const net = active ? active.incomePaise - active.expensePaise : 0;
  const count = fresh || selected.source === 'range';
  const empty = status === 'ok' && points.every((p) => p.incomePaise === 0 && p.expensePaise === 0);

  return (
    <Card className="p-5">
      <Text weight="bold" size={17} tone="default">
        Spending trend
      </Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
        {active ? formatMonthYear(active.month) : `Last ${months} months`}
      </Text>

      <View className="mt-4 flex-row gap-2">
        <Figure label="Income" color={colors.income} paise={active?.incomePaise ?? 0} count={count} />
        <Figure label="Expense" color={colors.expense} paise={active?.expensePaise ?? 0} count={count} />
        <Figure label="Net" color={net < 0 ? colors.expense : colors.primary} paise={net} count={count} />
      </View>

      <View className="mt-5">
        {status === 'pending' ? (
          <View style={{ height: 212 }} />
        ) : (
          <AreaChart points={points} selectedIndex={index} onSelect={onSelect} />
        )}
      </View>

      <Text weight="regular" size={11} tone="subtle" style={{ marginTop: 10 }}>
        {empty ? 'No transactions in this range yet.' : 'Drag across the chart to compare months'}
      </Text>
    </Card>
  );
}

function Figure({ label, color, paise, count }: { label: string; color: string; paise: number; count: boolean }) {
  const colors = useColors();
  // Lakh-scale figures go compact so three fit across a phone — and a compact
  // figure ("₹12.4L") has too few digits to count through, so it swaps.
  const compact = Math.abs(paise) >= 10_00_000 * 100;
  const style: TextStyle = {
    color: colors.foreground,
    ...font('bold', 15),
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  };

  return (
    <StatFigure label={label} dot={color} tile>
      {compact ? (
        <Text numberOfLines={1} adjustsFontSizeToFit style={style}>
          {formatINRCompact(paise)}
        </Text>
      ) : (
        <AnimatedAmount paise={paise} animate={count} durationMs={420} options={{ whole: true }} style={style} />
      )}
    </StatFigure>
  );
}
