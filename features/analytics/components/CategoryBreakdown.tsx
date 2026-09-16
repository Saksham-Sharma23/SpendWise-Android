import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Donut } from '../../../components/charts/Donut';
import { Card } from '../../../components/ui/Card';
import { CategoryIcon } from '../../../components/ui/CategoryIcon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { categoryColor } from '../../../lib/categoryColor';
import { formatMonthYear, type ISODate } from '../../../lib/dates';
import { formatINR } from '../../../lib/money';
import { fonts, useColors, withAlpha } from '../../../lib/theme';
import { clampMonth, shiftMonth, toSlices, type Slice } from '../period';
import { useCategoryBreakdown } from '../queries';

/**
 * Where one month's spending went: a donut with a month picker and a legend.
 *
 * The picker walks back to the ledger's first month and forward to the
 * current one — never into months that cannot hold data. Selecting a slice
 * (on the ring or in the legend) puts its figures in the hole; the selection
 * clears when the month changes, since the same category may not exist there.
 */
export function CategoryBreakdown({ today, earliest }: { today: ISODate; earliest: ISODate | null }) {
  const colors = useColors();
  const currentMonth = today.slice(0, 7);
  const earliestMonth = earliest?.slice(0, 7) ?? null;
  const [month, setMonth] = useState(currentMonth);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Midnight rolling into a new month, or the first transaction being deleted,
  // can leave the browsed month out of bounds.
  const shown = clampMonth(month, earliestMonth, currentMonth);
  useEffect(() => setSelectedKey(null), [shown]);

  const { data: rows, status } = useCategoryBreakdown(shown);

  const slices = useMemo(() => toSlices(rows), [rows]);
  const total = slices.reduce((a, s) => a + s.totalPaise, 0);
  const colorOf = (s: Slice) =>
    s.key === 'other' ? colors.subtle : s.key === 'none' ? colors.muted : categoryColor(s.color, s.name);

  const selected = slices.find((s) => s.key === selectedKey) ?? null;
  const canBack = earliestMonth == null || shown > earliestMonth;
  const canForward = shown < currentMonth;

  return (
    <Card className="p-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 17 }}>By category</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
            Where the month’s spending went
          </Text>
        </View>
      </View>

      <View
        className="mt-4 flex-row items-center justify-between rounded-full px-1 py-1"
        style={{ backgroundColor: colors.elevated }}
      >
        <MonthStep direction="back" disabled={!canBack} onPress={() => setMonth(shiftMonth(shown, -1))} />
        <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14 }}>
          {formatMonthYear(shown)}
        </Text>
        <MonthStep direction="forward" disabled={!canForward} onPress={() => setMonth(shiftMonth(shown, 1))} />
      </View>

      {status === 'pending' ? (
        <View style={{ height: 240 }} />
      ) : slices.length === 0 ? (
        <View className="items-center py-10">
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
            No spending in {formatMonthYear(shown)}.
          </Text>
        </View>
      ) : (
        <Animated.View key={shown} entering={FadeIn.duration(240)}>
          <View className="mt-5 items-center">
            <Donut
              slices={slices.map((s) => ({ key: s.key, value: s.totalPaise, color: colorOf(s) }))}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            >
              <View pointerEvents="none" className="items-center px-8">
                <Text
                  numberOfLines={1}
                  style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }}
                >
                  {selected ? displayName(selected) : 'Spent'}
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.5, marginTop: 2 }}
                >
                  {formatINR(selected ? selected.totalPaise : total, { whole: true })}
                </Text>
                {selected ? (
                  <Text style={{ color: colors.subtle, fontFamily: fonts.medium, fontSize: 12, marginTop: 1 }}>
                    {percent(selected.share)} of spend
                  </Text>
                ) : null}
              </View>
            </Donut>
          </View>

          <View className="mt-5 gap-1">
            {slices.map((s) => (
              <LegendRow
                key={s.key}
                slice={s}
                color={colorOf(s)}
                selected={s.key === selectedKey}
                dimmed={selectedKey != null && s.key !== selectedKey}
                onPress={() => setSelectedKey(s.key === selectedKey ? null : s.key)}
              />
            ))}
          </View>
        </Animated.View>
      )}
    </Card>
  );
}

function MonthStep({ direction, disabled, onPress }: { direction: 'back' | 'forward'; disabled: boolean; onPress: () => void }) {
  const colors = useColors();
  const Icon = direction === 'back' ? ChevronLeft : ChevronRight;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={direction === 'back' ? 'Previous month' : 'Next month'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.88}
      className="h-9 w-9 items-center justify-center rounded-full"
      style={{ backgroundColor: disabled ? 'transparent' : colors.card, opacity: disabled ? 0.35 : 1 }}
    >
      <Icon size={18} color={colors.foreground} strokeWidth={2.2} />
    </PressableScale>
  );
}

function LegendRow({
  slice,
  color,
  selected,
  dimmed,
  onPress,
}: {
  slice: Slice;
  color: string;
  selected: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${displayName(slice)}, ${formatINR(slice.totalPaise, { whole: true })}, ${percent(slice.share)}`}
      onPress={onPress}
      scaleTo={0.98}
      className="flex-row items-center gap-3 rounded-2xl px-2 py-2"
      style={{ backgroundColor: selected ? withAlpha(color, 0.12) : 'transparent', opacity: dimmed ? 0.55 : 1 }}
    >
      {slice.key === 'other' ? (
        <View className="items-center justify-center rounded-full" style={{ width: 34, height: 34, backgroundColor: colors.elevated }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
        </View>
      ) : (
        <CategoryIcon icon={slice.icon} color={color} size={34} />
      )}
      <View className="flex-1">
        <View className="flex-row items-baseline justify-between">
          <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1 }}>
            {displayName(slice)}
          </Text>
          <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14, fontVariant: ['tabular-nums'] }}>
            {formatINR(slice.totalPaise, { whole: true })}
          </Text>
        </View>
        <View className="mt-1.5 flex-row items-center gap-2">
          <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.elevated }}>
            <View className="h-full rounded-full" style={{ width: `${Math.max(2, slice.share * 100)}%`, backgroundColor: color }} />
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11, width: 34, textAlign: 'right' }}>
            {percent(slice.share)}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

function displayName(s: Slice): string {
  if (s.key === 'other') return `Other · ${s.members} categories`;
  return s.name ?? 'Uncategorised';
}

/** Whole percent, but never "0%" for a slice that exists. */
function percent(share: number): string {
  const p = share * 100;
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
}
