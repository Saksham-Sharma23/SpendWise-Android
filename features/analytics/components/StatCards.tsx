import { useRouter } from 'expo-router';
import { CalendarDays, Crown, PiggyBank, Receipt, type LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { AnimatedAmount } from '@/components/ui/AnimatedAmount';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { Swap } from '@/components/ui/Swap';
import { categoryColor } from '@/lib/categoryColor';
import type { DbQueryResult } from '@/lib/db/useDbQuery';
import { formatDayMonth } from '@/lib/dates';
import { formatCount, formatINR } from '@/lib/money';
import { fonts, useColors, withAlpha } from '@/lib/theme';
import type { PeriodStats } from '../queries';

/**
 * The range's headline figures: money in, money out, what is left. The hero
 * of the screen, so it takes the accent surface.
 */
export function PeriodSummary({ months, stats }: { months: number; stats: DbQueryResult<PeriodStats> }) {
  const colors = useColors();
  if (stats.status === 'pending') return <View style={{ height: 150 }} />;
  const s = stats.data;

  return (
    <Card variant="accent" className="p-5">
      <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>Net · last {months} months</Text>
      <AnimatedAmount
        paise={s.netPaise}
        options={{ whole: true }}
        style={{
          color: s.netPaise < 0 ? colors.expense : colors.primary,
          fontFamily: fonts.bold,
          fontSize: 34,
          letterSpacing: -1.1,
          marginTop: 4,
        }}
      />
      <View className="mt-4 flex-row gap-3">
        <SummaryFigure label="Income" color={colors.income} paise={s.incomePaise} />
        <SummaryFigure label="Spent" color={colors.expense} paise={s.expensePaise} />
      </View>
      <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 11, marginTop: 12 }}>
        {formatCount(s.count)} {s.count === 1 ? 'transaction' : 'transactions'}
      </Text>
    </Card>
  );
}

function SummaryFigure({ label, color, paise }: { label: string; color: string; paise: number }) {
  const colors = useColors();
  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>{label}</Text>
      </View>
      <AnimatedAmount
        paise={paise}
        options={{ whole: true }}
        style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 17, marginTop: 3 }}
      />
    </View>
  );
}

/**
 * The four stat cards from the web screen: average per day, biggest expense,
 * top category and savings rate — all for the selected range.
 */
export function StatGrid({ stats }: { stats: DbQueryResult<PeriodStats> }) {
  const colors = useColors();
  const router = useRouter();
  if (stats.status === 'pending') return <View style={{ height: 260 }} />;
  const s = stats.data;

  const topShare = s.topCategory && s.expensePaise > 0 ? s.topCategory.totalPaise / s.expensePaise : 0;
  const rate = s.savingsRate;

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <Stat
          icon={CalendarDays}
          tone={colors.primary}
          label="Avg per day"
          value={formatINR(s.avgPerDayPaise, { whole: s.avgPerDayPaise >= 100_00 })}
          detail={`Spent over ${formatCount(s.days)} ${s.days === 1 ? 'day' : 'days'}`}
        />
        <Stat
          icon={PiggyBank}
          tone={rate == null ? colors.muted : rate < 0 ? colors.expense : colors.income}
          label="Savings rate"
          value={rate == null ? '—' : `${rate < 0 ? '−' : ''}${Math.abs(rate).toFixed(Math.abs(rate) < 10 ? 1 : 0)}%`}
          detail={
            rate == null
              ? 'No income in this range'
              : rate < 0
                ? `${formatINR(-s.netPaise, { whole: true })} over income`
                : `${formatINR(s.netPaise, { whole: true })} kept`
          }
        />
      </View>

      <View className="flex-row gap-3">
        <Stat
          icon={Receipt}
          tone={colors.expense}
          label="Biggest expense"
          value={s.biggest ? formatINR(s.biggest.amountPaise, { whole: true }) : '—'}
          detail={
            s.biggest
              ? `${s.biggest.note?.trim() || s.biggest.categoryName || 'Uncategorised'} · ${formatDayMonth(s.biggest.date)}`
              : 'No expenses in this range'
          }
          onPress={
            s.biggest
              ? () => router.push({ pathname: '/(modals)/transaction', params: { id: String(s.biggest!.id) } })
              : undefined
          }
        />
        <Stat
          icon={Crown}
          tone={colors.warning}
          label="Top category"
          value={s.topCategory ? (s.topCategory.name ?? 'Uncategorised') : '—'}
          detail={
            s.topCategory
              ? `${formatINR(s.topCategory.totalPaise, { whole: true })} · ${Math.round(topShare * 100)}% of spend`
              : 'No expenses in this range'
          }
          leading={
            s.topCategory ? (
              <CategoryIcon
                icon={s.topCategory.icon}
                color={categoryColor(s.topCategory.color, s.topCategory.name)}
                size={32}
              />
            ) : undefined
          }
        />
      </View>
    </View>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  detail,
  leading,
  onPress,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
  detail: string;
  /** Replaces the icon badge, e.g. with the category's own icon. */
  leading?: React.ReactNode;
  onPress?: () => void;
}) {
  const colors = useColors();
  const body = (
    <Card className="flex-1 p-4" glow={tone}>
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>{label}</Text>
        {leading ?? (
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: withAlpha(tone, 0.14) }}
          >
            <Icon size={15} color={tone} strokeWidth={2.4} />
          </View>
        )}
      </View>
      {/* These are not all numbers — a category name, a percentage, an em dash
          — so they cross-fade rather than count up like the summary above. */}
      <Swap swapKey={value}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            color: colors.foreground,
            fontFamily: fonts.bold,
            fontSize: 20,
            letterSpacing: -0.4,
            marginTop: 10,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      </Swap>
      <Swap swapKey={detail}>
        <Text numberOfLines={2} style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 11, marginTop: 4 }}>
          {detail}
        </Text>
      </Swap>
    </Card>
  );

  if (!onPress) return <View className="flex-1">{body}</View>;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityHint="Opens this transaction"
      onPress={onPress}
      className="flex-1"
    >
      {body}
    </PressableScale>
  );
}
