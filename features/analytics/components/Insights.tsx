import { useRouter } from 'expo-router';
import { ChartColumn } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '../../../components/layout/Screen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Segmented } from '../../../components/ui/Segmented';
import { useToday } from '../../../lib/today';
import { RANGES, type RangeMonths } from '../period';
import { useEarliestDate, usePeriodStats } from '../queries';
import { CategoryBreakdown } from './CategoryBreakdown';
import { PeriodSummary, StatGrid } from './StatCards';
import { SpendingTrend } from './SpendingTrend';

/** Staggered entrance, so the screen assembles rather than pops in. */
function Section({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(40 + index * 70).duration(420)} className="px-5">
      {children}
    </Animated.View>
  );
}

/**
 * Insights: where the money goes, over time.
 *
 * One range (3 / 6 / 12 / 24 months) drives the summary, the trend and the
 * stat cards together, so every figure on screen describes the same period.
 * The category donut has its own month picker — "which month" is a different
 * question from "over how long".
 *
 * Every figure is aggregated in SQL (features/analytics/sql.ts). Nothing
 * renders until the first real answer arrives, and an empty ledger gets a way
 * forward instead of a screen of zeros (CLAUDE.md #12).
 */
export function Insights() {
  const router = useRouter();
  const today = useToday();
  const [range, setRange] = useState<RangeMonths>(12);
  const earliest = useEarliestDate();
  // One subscription feeds both the summary and the stat cards.
  const stats = usePeriodStats(range, today);

  const empty = earliest.status === 'ok' && earliest.data == null;

  return (
    <Screen title="Insights" subtitle="Where your money goes, over time">
      {earliest.status === 'pending' ? null : empty ? (
        <View className="px-5">
          <EmptyState
            icon={ChartColumn}
            title="Nothing to analyse yet"
            description="Your trend, category breakdown and stats appear here as soon as you record a transaction."
            action={{ label: 'Add a transaction', onPress: () => router.push('/(modals)/transaction') }}
            secondary={{ label: 'Import a sheet', onPress: () => router.push('/import/pick') }}
          />
        </View>
      ) : (
        <View className="gap-3">
          <Section index={0}>
            <Segmented<`${RangeMonths}`>
              value={`${range}`}
              onChange={(v) => setRange(Number(v) as RangeMonths)}
              options={RANGES.map((m) => ({ value: `${m}` as const, label: `${m}M` }))}
            />
          </Section>

          <Section index={1}>
            <PeriodSummary months={range} stats={stats} />
          </Section>

          <Section index={2}>
            <SpendingTrend months={range} today={today} />
          </Section>

          <Section index={3}>
            <StatGrid stats={stats} />
          </Section>

          <Section index={4}>
            <CategoryBreakdown today={today} earliest={earliest.data} />
          </Section>
        </View>
      )}
    </Screen>
  );
}
