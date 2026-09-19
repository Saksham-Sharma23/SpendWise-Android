import { useRouter } from 'expo-router';
import {
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Screen } from '@/components/layout/Screen';
import { Welcome } from '@/components/layout/Welcome';
import { AnimatedAmount } from '@/components/ui/AnimatedAmount';
import { BudgetOverviewCard } from '@/components/ui/BudgetOverviewCard';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { InsightBanner } from '@/components/ui/InsightBanner';
import { LedgerRow } from '@/components/ui/LedgerRow';
import { PressableScale } from '@/components/ui/PressableScale';
import { RenewalsCard } from '@/components/ui/RenewalsCard';
import { MONTHS_LONG, fromISODate, type ISODate } from '@/lib/dates';
import { buildInsight } from '@/lib/insight';
import { formatINR } from '@/lib/money';
import { upcomingRenewals } from '@/lib/renewals';
import { fonts, useColors, withAlpha } from '@/lib/theme';
import { useToday } from '@/lib/today';
import {
  dismissOnboarding,
  useActiveSubscriptions,
  useDashboardBudgets,
  useHasTransactions,
  useMonthOverview,
  useOnboardingDismissed,
  useRecentTransactions,
  useTopCategories,
  type CategorySpend,
  type MonthOverview,
} from '../data/hooks';
import { TrendChart } from './TrendChart';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function greeting(hour: number): string {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Percentage change, or null when there is no baseline to compare against. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Staggered entrance, so the dashboard assembles rather than pops in. */
function Section({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 70).duration(450)} className="px-5">
      {children}
    </Animated.View>
  );
}

export function Dashboard() {
  const colors = useColors();
  const router = useRouter();
  // The date comes from the moving "today" store, so the header, the month
  // windows and every figure roll over at midnight without a remount.
  const today = useToday();
  const day = fromISODate(today);
  const month = MONTHS_LONG[day.getMonth()];

  const { data: overview } = useMonthOverview(today);
  const net = overview.incomePaise - overview.expensePaise;
  const savedPct = overview.incomePaise > 0 ? (net / overview.incomePaise) * 100 : 0;

  // First run: a genuinely empty ledger that hasn't been waved off gets the
  // three doors instead of a dashboard of zeros. Both answers must be real
  // ('ok') — while either is pending, show neither, so nothing flashes.
  const hasTx = useHasTransactions();
  const dismissed = useOnboardingDismissed();
  const showWelcome = hasTx.status === 'ok' && dismissed.status === 'ok' && !hasTx.data && !dismissed.data;

  return (
    <Screen
      eyebrow={`${greeting(new Date().getHours())} 👋`}
      title="Your money"
      subtitle={`${WEEKDAYS[day.getDay()]}, ${day.getDate()} ${month} ${day.getFullYear()}`}
      right={
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Search transactions"
          onPress={() => router.push('/(tabs)/transactions')}
          scaleTo={0.9}
          className="h-11 w-11 items-center justify-center rounded-full border"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
          <Search size={19} color={colors.foreground} />
        </PressableScale>
      }
    >
      {showWelcome ? (
        <Welcome
          onAdd={() => router.push('/(modals)/transaction')}
          onImport={() => router.push('/sheets')}
          onRestore={() => router.push('/backup')}
          onSkip={dismissOnboarding}
        />
      ) : (
        <View className="gap-3">
          <Section index={0}>
            <Card variant="accent" className="p-5">
              <View className="flex-row items-center justify-between">
                <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>
                  Net balance · {month}
                </Text>
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.primarySoft }}
                >
                  <Wallet size={17} color={colors.primary} />
                </View>
              </View>
              <AnimatedAmount
                paise={net}
                style={{
                  color: net < 0 ? colors.expense : colors.primary,
                  fontFamily: fonts.bold,
                  fontSize: 38,
                  letterSpacing: -1.2,
                  marginTop: 6,
                }}
              />
              <View className="mt-3 flex-row items-center gap-2">
                <Chip
                  tone={savedPct >= 0 ? 'good' : 'bad'}
                  icon={savedPct >= 0 ? ArrowUpRight : ArrowDownRight}
                  label={`${Math.abs(savedPct).toFixed(1)}%`}
                />
                <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
                  {savedPct >= 0 ? 'of income saved' : 'more spent than earned'}
                </Text>
              </View>
            </Card>
          </Section>

          <Section index={1}>
            <View className="flex-row gap-3">
              <StatCard
                label="Income"
                icon={TrendingUp}
                color={colors.income}
                paise={overview.incomePaise}
                change={pctChange(overview.incomePaise, overview.lastIncomePaise)}
                higherIsBetter
              />
              <StatCard
                label="Expenses"
                icon={TrendingDown}
                color={colors.expense}
                paise={overview.expensePaise}
                change={pctChange(overview.expensePaise, overview.lastExpensePaise)}
                higherIsBetter={false}
              />
            </View>
          </Section>

          <Section index={2}>
            <Insight today={today} overview={overview} />
          </Section>

          <Section index={3}>
            <TrendChart />
          </Section>

          <Section index={4}>
            <TopCategories today={today} expensePaise={overview.expensePaise} />
          </Section>

          <Section index={5}>
            <Budgets today={today} />
          </Section>

          <Section index={6}>
            <Renewals today={today} />
          </Section>

          <Section index={7}>
            <RecentTransactions />
          </Section>
        </View>
      )}
    </Screen>
  );
}

/**
 * The one-sentence insight. Its own component so the extra top-category query
 * only re-renders the banner, and nothing shows until both answers are real.
 */
function Insight({ today, overview }: { today: ISODate; overview: MonthOverview }) {
  const { data: top, status } = useTopCategories(today, 1);
  if (status !== 'ok') return null;
  const lead = top[0];
  const insight = buildInsight({
    incomePaise: overview.incomePaise,
    expensePaise: overview.expensePaise,
    count: overview.count,
    lastExpenseToDatePaise: overview.lastExpenseToDatePaise,
    topCategory: lead ? { name: lead.name ?? 'Uncategorised', totalPaise: lead.totalPaise } : null,
  });
  return <InsightBanner insight={insight} />;
}

/** Budget progress for Home — the same cycle windows the Budgets screen uses. */
function Budgets({ today }: { today: ISODate }) {
  const router = useRouter();
  const { data: rows, status } = useDashboardBudgets(today, 4);
  // Nothing while pending: an empty prompt that flips to four donuts a frame
  // later reads as a glitch (convention #12).
  if (status === 'pending') return null;
  return (
    <BudgetOverviewCard
      items={rows.map((b) => ({
        id: b.id,
        categoryName: b.categoryName,
        fill: b.fill,
        ratio: b.ratio,
        state: b.state,
        spentPaise: b.spentPaise,
        limitPaise: b.limitPaise,
      }))}
      overCount={rows.filter((b) => b.state === 'over').length}
      onOpen={() => router.push('/budgets')}
    />
  );
}

/** Upcoming renewals, computed on read from active subscriptions (lib/renewals). */
function Renewals({ today }: { today: ISODate }) {
  const router = useRouter();
  const { data: subs, status } = useActiveSubscriptions();
  if (status === 'pending') return null;
  return <RenewalsCard renewals={upcomingRenewals(subs, today, 3)} onOpenTracker={() => router.push('/tracker')} />;
}

function Chip({ tone, icon: Icon, label }: { tone: 'good' | 'bad' | 'neutral'; icon?: LucideIcon; label: string }) {
  const colors = useColors();
  const color = tone === 'good' ? colors.income : tone === 'bad' ? colors.expense : colors.muted;
  return (
    <View
      className="flex-row items-center gap-0.5 rounded-full px-2 py-0.5"
      style={{ backgroundColor: withAlpha(color, 0.14) }}
    >
      {Icon ? <Icon size={12} color={color} strokeWidth={2.5} /> : null}
      <Text style={{ color, fontFamily: fonts.semibold, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function StatCard({
  label,
  icon: Icon,
  color,
  paise,
  change,
  higherIsBetter,
}: {
  label: string;
  icon: LucideIcon;
  color: string;
  paise: number;
  change: number | null;
  higherIsBetter: boolean;
}) {
  const colors = useColors();
  const up = (change ?? 0) >= 0;
  const good = change == null ? null : up === higherIsBetter;

  return (
    <Card className="flex-1 p-4" glow={color}>
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>{label}</Text>
        <View
          className="h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: withAlpha(color, 0.14) }}
        >
          <Icon size={15} color={color} strokeWidth={2.4} />
        </View>
      </View>
      <AnimatedAmount
        paise={paise}
        options={{ whole: true }}
        style={{
          color: colors.foreground,
          fontFamily: fonts.bold,
          fontSize: 21,
          letterSpacing: -0.5,
          marginTop: 10,
        }}
      />
      <View className="mt-2 flex-row items-center gap-1.5">
        {change == null ? (
          <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 11 }}>No data last month</Text>
        ) : (
          <>
            <Chip
              tone={good ? 'good' : 'bad'}
              icon={up ? ArrowUpRight : ArrowDownRight}
              label={`${Math.abs(change).toFixed(0)}%`}
            />
            <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 11 }}>vs last month</Text>
          </>
        )}
      </View>
    </Card>
  );
}

function TopCategories({ today, expensePaise }: { today: ISODate; expensePaise: number }) {
  const colors = useColors();
  const { data: top } = useTopCategories(today, 4);
  if (top.length === 0) return null;

  return (
    <Card className="p-5">
      <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 17 }}>Where it went</Text>
      <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
        Top categories this month
      </Text>
      <View className="mt-4 gap-4">
        {top.map((c, i) => (
          <CategoryBar
            key={c.id ?? 'none'}
            item={c}
            share={expensePaise > 0 ? c.totalPaise / expensePaise : 0}
            index={i}
          />
        ))}
      </View>
    </Card>
  );
}

function CategoryBar({ item, share, index }: { item: CategorySpend; share: number; index: number }) {
  const colors = useColors();
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withDelay(150 + index * 90, withTiming(Math.min(1, share), { duration: 700 }));
  }, [share, index, width]);
  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  const tint = item.color ?? colors.muted;

  return (
    <View className="flex-row items-center gap-3">
      <CategoryIcon icon={item.icon} color={item.color} size={38} />
      <View className="flex-1">
        <View className="flex-row items-baseline justify-between">
          <Text
            numberOfLines={1}
            style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1 }}
          >
            {item.name ?? 'Uncategorised'}
          </Text>
          <Text
            style={{
              color: colors.foreground,
              fontFamily: fonts.semibold,
              fontSize: 14,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatINR(item.totalPaise, { whole: true })}
          </Text>
        </View>
        <View className="mt-2 flex-row items-center gap-2">
          <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: colors.elevated }}>
            <Animated.View className="h-full rounded-full" style={[{ backgroundColor: tint }, fill]} />
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11, width: 32, textAlign: 'right' }}>
            {Math.round(share * 100)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

function RecentTransactions() {
  const colors = useColors();
  const router = useRouter();
  const { data: rows, status } = useRecentTransactions(5);

  return (
    <Card className="px-5 pb-2 pt-5">
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 17 }}>Recent transactions</Text>
        {rows.length > 0 ? (
          <PressableScale
            accessibilityRole="button"
            onPress={() => router.push('/(tabs)/transactions')}
            className="py-1 pl-3"
          >
            <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 13 }}>View all</Text>
          </PressableScale>
        ) : null}
      </View>

      {status === 'pending' ? (
        // No result yet: hold the card's height, never flash "Nothing here yet".
        <View style={{ height: 120 }} />
      ) : rows.length === 0 ? (
        <View className="items-center py-8">
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>Nothing here yet.</Text>
          <PressableScale
            accessibilityRole="button"
            onPress={() => router.push('/(modals)/transaction')}
            className="mt-3 flex-row items-center gap-1.5 rounded-full px-4 py-2.5"
            style={{ backgroundColor: colors.primary }}
          >
            <Plus size={16} color={colors.onPrimary} strokeWidth={2.6} />
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.semibold }}>Add your first</Text>
          </PressableScale>
        </View>
      ) : (
        <View className="mt-2">
          {rows.map((row, i) => (
            <PressableScale
              key={row.id}
              accessibilityRole="button"
              scaleTo={0.98}
              onPress={() => router.push({ pathname: '/(modals)/transaction', params: { id: String(row.id) } })}
              className="py-3"
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
            >
              <LedgerRow row={row} />
            </PressableScale>
          ))}
        </View>
      )}
    </Card>
  );
}
