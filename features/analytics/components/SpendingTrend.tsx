import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { AreaChart } from '../../../components/charts/AreaChart';
import { Card } from '../../../components/ui/Card';
import { formatMonthYear, type ISODate } from '../../../lib/dates';
import { formatINR, formatINRCompact } from '../../../lib/money';
import { fonts, useColors } from '../../../lib/theme';
import { useSpendingTrend } from '../queries';

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
  const [selected, setSelected] = useState({ months, index: months - 1 });

  // Stable, so the chart's gesture is not rebuilt on every render.
  const onSelect = useCallback((index: number) => setSelected({ months, index }), [months]);

  const wanted = selected.months === months ? selected.index : months - 1;
  const index = Math.min(Math.max(0, wanted), Math.max(0, points.length - 1));
  const active = points[index];
  const net = active ? active.incomePaise - active.expensePaise : 0;
  const empty = status === 'ok' && points.every((p) => p.incomePaise === 0 && p.expensePaise === 0);

  return (
    <Card className="p-5">
      <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 17 }}>Spending trend</Text>
      <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
        {active ? formatMonthYear(active.month) : `Last ${months} months`}
      </Text>

      <View className="mt-4 flex-row gap-2">
        <Figure label="Income" color={colors.income} paise={active?.incomePaise ?? 0} />
        <Figure label="Expense" color={colors.expense} paise={active?.expensePaise ?? 0} />
        <Figure label="Net" color={net < 0 ? colors.expense : colors.primary} paise={net} />
      </View>

      <View className="mt-5">
        {status === 'pending' ? (
          <View style={{ height: 212 }} />
        ) : (
          <AreaChart points={points} selectedIndex={index} onSelect={onSelect} />
        )}
      </View>

      <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 11, marginTop: 10 }}>
        {empty ? 'No transactions in this range yet.' : 'Drag across the chart to compare months'}
      </Text>
    </Card>
  );
}

function Figure({ label, color, paise }: { label: string; color: string; paise: number }) {
  const colors = useColors();
  return (
    <View className="flex-1 rounded-2xl px-3 py-2.5" style={{ backgroundColor: colors.elevated }}>
      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>{label}</Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 15, marginTop: 3, fontVariant: ['tabular-nums'] }}
      >
        {/* Lakh-scale figures go compact so three fit across a phone. */}
        {Math.abs(paise) >= 10_00_000 * 100 ? formatINRCompact(paise) : formatINR(paise, { whole: true })}
      </Text>
    </View>
  );
}
