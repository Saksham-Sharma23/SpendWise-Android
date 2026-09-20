import { useState } from 'react';
import { View } from 'react-native';

import { TrendChart as Chart, type TrendMode } from '@/components/charts/TrendChart';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { formatMonthYear } from '@/lib/dates';
import { formatINR, formatINRCompact } from '@/lib/money';
import { useColors } from '@/lib/theme';
import { useToday } from '@/lib/today';
import { useMonthlyTrend } from '../data/hooks';
import { Text } from '@/components/ui/Text';
import { StatFigure } from '@/components/ui/StatFigure';

type Range = '6' | '12';

/**
 * Home's "Income vs Expense" card: the reusable chart
 * (components/charts/TrendChart) plus the controls and figures around it.
 *
 * Two switches — Bar/Line and 6M/12M — and a tapped month's exact figures in
 * the header. The chart itself only draws; the numbers come aggregated from
 * SQL (useMonthlyTrend), at most 12 rows.
 */
export function IncomeExpenseCard() {
  const colors = useColors();
  const [range, setRange] = useState<Range>('6');
  const [mode, setMode] = useState<TrendMode>('bar');
  const today = useToday();
  const { data: points, status } = useMonthlyTrend(Number(range), today);
  const [selected, setSelected] = useState<number | null>(null);

  // Default to the latest month; reset when the range changes length.
  const activeIndex = selected != null && selected < points.length ? selected : points.length - 1;
  const active = points[activeIndex];
  const empty = status === 'ok' && points.every((p) => p.incomePaise === 0 && p.expensePaise === 0);

  return (
    <Card className="p-5">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text weight="bold" size={17} tone="default">
            Income vs Expense
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {active ? formatMonthYear(active.month) : `Last ${range} months`}
          </Text>
        </View>
        <View style={{ width: 112 }}>
          <Segmented<TrendMode>
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'bar', label: 'Bar' },
              { value: 'line', label: 'Line' },
            ]}
          />
        </View>
      </View>

      <View className="mt-4 flex-row gap-3">
        <Figure label="Income" color={colors.income} paise={active?.incomePaise ?? 0} />
        <Figure label="Expense" color={colors.expense} paise={active?.expensePaise ?? 0} />
      </View>

      <View className="mt-5">
        <Chart points={points} mode={mode} selectedIndex={activeIndex} onSelect={setSelected} />
      </View>

      <View className="mt-4 flex-row items-center justify-between">
        <Text weight="regular" size={11} tone="subtle">
          {empty ? 'Your trend appears as you add transactions.' : 'Tap a month for its figures'}
        </Text>
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
    </Card>
  );
}

function Figure({ label, color, paise }: { label: string; color: string; paise: number }) {
  return (
    <StatFigure label={label} dot={color} tile>
      <Text
        variant="amount"
        weight="bold"
        size={16}
        tone="default"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ marginTop: 3 }}
      >
        {/* Crore-scale month totals switch to the compact form so they fit. */}
        {paise >= 1_00_00_000 * 100 ? formatINRCompact(paise) : formatINR(paise, { whole: true })}
      </Text>
    </StatFigure>
  );
}
