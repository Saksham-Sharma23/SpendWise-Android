import { useRouter } from 'expo-router';
import { PiggyBank, Plus, TriangleAlert } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { MiniDonut, softToneFor, toneFor } from '@/components/charts/MiniDonut';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PressableScale } from '@/components/ui/PressableScale';
import { colorForName } from '@/lib/categoryColor';
import { formatDayMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { useToday } from '@/lib/today';
import { fonts, useColors, withAlpha } from '@/lib/theme';
import { budgetTotals, daysLeftLabel, type BudgetProgress } from '../domain/progress';
import { restoreBudget, softDeleteBudget, useBudgetsWithSpend } from '../data/queries';

/**
 * Budgets: one card per category limit, with this cycle's spend.
 *
 * Everything on screen is computed against the budget's OWN cycle window, not
 * the calendar month — a budget resetting on the 15th is halfway through its
 * cycle on the 30th, and saying "this month" would be a different number.
 */
export function BudgetList() {
  const colors = useColors();
  const router = useRouter();
  const today = useToday();
  const { data: rows, status } = useBudgetsWithSpend(today);

  const totals = budgetTotals(rows);
  const overBudget = rows.filter((b) => b.state === 'over');

  return (
    <Screen
      back
      title="Budgets"
      subtitle={rows.length > 0 ? `${rows.length} ${rows.length === 1 ? 'budget' : 'budgets'}` : undefined}
      right={
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="New budget"
          onPress={() => router.push('/(modals)/budget')}
          scaleTo={0.9}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primary }}
        >
          <Plus size={21} color={colors.onPrimary} strokeWidth={2.6} />
        </PressableScale>
      }
    >
      {status === 'error' ? (
        <View className="px-5">
          <EmptyState
            icon={PiggyBank}
            title="Couldn't load your budgets"
            description="Something went wrong reading the database. Pull down on Home to retry, or reopen the app."
          />
        </View>
      ) : status === 'ok' && rows.length === 0 ? (
        <View className="px-5">
          <EmptyState
            icon={PiggyBank}
            title="No budgets yet"
            description="Set a limit for a category and watch it fill up as you spend, with a warning at 75%."
            action={{ label: 'Set a budget', onPress: () => router.push('/(modals)/budget') }}
          />
        </View>
      ) : rows.length > 0 ? (
        <View className="gap-3 px-5">
          {/* Over-budget first: it is the one thing worth interrupting for. */}
          {overBudget.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(320)}>
              <View
                className="flex-row items-center gap-3 rounded-2xl border p-4"
                style={{ backgroundColor: colors.expenseSoft, borderColor: withAlpha(colors.expense, 0.3) }}
              >
                <TriangleAlert size={19} color={colors.expense} />
                <Text className="flex-1" style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 13 }}>
                  {overBudget.length === 1
                    ? `${overBudget[0]!.categoryName} is over budget by ${formatINR(Math.abs(overBudget[0]!.remainingPaise), { whole: true })}`
                    : `${overBudget.length} budgets are over their limit`}
                </Text>
              </View>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(40).duration(320)}>
            <Card className="flex-row p-5">
              <Figure label="Budgeted" value={formatINR(totals.limitPaise, { whole: true })} />
              <Figure label="Spent" value={formatINR(totals.spentPaise, { whole: true })} />
              <Figure
                label={totals.remainingPaise < 0 ? 'Over by' : 'Left'}
                value={formatINR(Math.abs(totals.remainingPaise), { whole: true })}
                tint={totals.remainingPaise < 0 ? colors.expense : colors.primary}
                last
              />
            </Card>
          </Animated.View>

          {rows.map((b, i) => (
            <Animated.View key={b.id} entering={FadeInDown.delay(80 + i * 45).duration(320)}>
              <BudgetCard
                budget={b}
                onPress={() => router.push({ pathname: '/(modals)/budget', params: { id: String(b.id) } })}
                onDelete={() => {
                  if (!softDeleteBudget(b.id).ok) return;
                  toast.success('Budget deleted', {
                    action: { label: 'Undo', onClick: () => restoreBudget(b.id) },
                  });
                }}
              />
            </Animated.View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function Figure({ label, value, tint, last }: { label: string; value: string; tint?: string; last?: boolean }) {
  const colors = useColors();
  return (
    <View className="flex-1 px-1" style={last ? undefined : { borderRightWidth: 1, borderRightColor: colors.border }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>{label}</Text>
      <Text
        numberOfLines={1}
        style={{
          color: tint ?? colors.foreground,
          fontFamily: fonts.bold,
          fontSize: 16,
          marginTop: 3,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function BudgetCard({
  budget,
  onPress,
  onDelete,
}: {
  budget: BudgetProgress;
  onPress: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const tone = toneFor(budget.state);
  const color = budget.categoryColor ?? colorForName(budget.categoryName);
  const percent = Math.round(budget.ratio * 100);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${budget.categoryName} budget, ${percent} percent used`}
      onPress={onPress}
      onLongPress={onDelete}
      scaleTo={0.98}
    >
      <Card className="p-4">
        <View className="flex-row items-center gap-3">
          <MiniDonut fill={budget.fill} color={tone} size={54}>
            <CategoryIcon icon={budget.categoryIcon} color={color} size={34} />
          </MiniDonut>

          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text
                numberOfLines={1}
                className="flex-1"
                style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}
              >
                {budget.categoryName}
              </Text>
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: softToneFor(budget.state) }}>
                <Text style={{ color: tone, fontFamily: fonts.semibold, fontSize: 11, fontVariant: ['tabular-nums'] }}>
                  {budget.state === 'paused' ? 'Paused' : `${percent}%`}
                </Text>
              </View>
            </View>

            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 3 }}>
              <Text style={{ color: colors.foreground, fontFamily: fonts.semibold }}>
                {formatINR(budget.spentPaise, { whole: true })}
              </Text>
              {` of ${formatINR(budget.limitPaise, { whole: true })}`}
            </Text>

            <View className="mt-2 flex-row items-center justify-between">
              <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 11 }}>
                {daysLeftLabel(budget.daysLeft)} · resets {formatDayMonth(budget.cycleEnd)}
              </Text>
              <Text
                style={{
                  color: budget.remainingPaise < 0 ? colors.expense : colors.muted,
                  fontFamily: fonts.medium,
                  fontSize: 11,
                }}
              >
                {budget.remainingPaise < 0
                  ? `${formatINR(Math.abs(budget.remainingPaise), { whole: true })} over`
                  : `${formatINR(budget.perDayLeftPaise, { whole: true })}/day left`}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    </PressableScale>
  );
}
