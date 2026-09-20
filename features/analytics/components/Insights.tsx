import { useRouter } from 'expo-router';
import { ChartColumn } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';
import { useToday } from '@/lib/today';
import { RANGES, type RangeMonths } from '../domain/period';
import { useEarliestDate, usePeriodStats } from '../data/hooks';
import { CategoryBreakdown } from './CategoryBreakdown';
import { PeriodSummary, StatGrid } from './StatCards';
import { SpendingTrend } from './SpendingTrend';
import { Section } from '@/components/ui/Section';

/** Each card rises 70 ms after the one above it. */
const STAGGER = { base: 40, step: 70 };

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
  const earliest = useEarliestDate(today);
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
            secondary={{ label: 'Import a sheet', onPress: () => router.push('/sheets') }}
          />
        </View>
      ) : (
        <View className="gap-3">
          <Section stagger={STAGGER} index={0}>
            <Segmented<`${RangeMonths}`>
              value={`${range}`}
              onChange={(v) => setRange(Number(v) as RangeMonths)}
              options={RANGES.map((m) => ({ value: `${m}` as const, label: `${m}M` }))}
            />
          </Section>

          <Section stagger={STAGGER} index={1}>
            <PeriodSummary months={range} stats={stats} />
          </Section>

          <Section stagger={STAGGER} index={2}>
            <SpendingTrend months={range} today={today} />
          </Section>

          <Section stagger={STAGGER} index={3}>
            <StatGrid stats={stats} />
          </Section>

          <Section stagger={STAGGER} index={4}>
            <CategoryBreakdown today={today} earliest={earliest.data} />
          </Section>
        </View>
      )}
    </Screen>
  );
}
