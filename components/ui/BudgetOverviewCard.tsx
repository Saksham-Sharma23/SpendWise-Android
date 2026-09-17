import { ChevronRight, PiggyBank, TriangleAlert } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { MiniDonut, softToneFor, toneFor } from '../charts/MiniDonut';
import { formatINRCompact } from '../../lib/money';
import { fonts, useColors } from '../../lib/theme';
import { Card } from './Card';
import { PressableScale } from './PressableScale';

/**
 * Home's budget overview. Presentational only: it takes rows that
 * features/budgets has already computed, so Home and the Budgets screen can
 * never disagree about a percentage.
 */

export interface BudgetOverviewItem {
  id: number;
  categoryName: string;
  fill: number;
  ratio: number;
  state: 'under' | 'warning' | 'over' | 'paused';
  spentPaise: number;
  limitPaise: number;
}

interface Props {
  items: BudgetOverviewItem[];
  overCount: number;
  onOpen: () => void;
}

export function BudgetOverviewCard({ items, overCount, onOpen }: Props) {
  const colors = useColors();
  if (items.length === 0) {
    return (
      <PressableScale
        accessibilityRole="button"
        onPress={onOpen}
        className="flex-row items-center gap-3 rounded-3xl border p-4"
        style={{ backgroundColor: colors.card, borderColor: colors.border }}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <PiggyBank size={21} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>Set up budgets</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>
            Track your financial health by category
          </Text>
        </View>
        <ChevronRight size={18} color={colors.muted} />
      </PressableScale>
    );
  }

  return (
    <Card className="px-5 pb-4 pt-5">
      <PressableScale accessibilityRole="button" onPress={onOpen} scaleTo={0.99} className="flex-row items-center">
        <Text className="flex-1" style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 17 }}>
          Budgets
        </Text>
        {overCount > 0 ? (
          <View
            className="mr-2 flex-row items-center gap-1 rounded-full px-2 py-0.5"
            style={{ backgroundColor: colors.expenseSoft }}
          >
            <TriangleAlert size={11} color={colors.expense} />
            <Text style={{ color: colors.expense, fontFamily: fonts.semibold, fontSize: 10 }}>{overCount} over</Text>
          </View>
        ) : null}
        <ChevronRight size={18} color={colors.muted} />
      </PressableScale>

      <View className="mt-4 flex-row justify-between">
        {items.map((b) => (
          <View key={b.id} className="flex-1 items-center px-1">
            <MiniDonut fill={b.fill} color={toneFor(b.state)} size={58} thickness={5}>
              <Text
                style={{
                  color: toneFor(b.state),
                  fontFamily: fonts.bold,
                  fontSize: 13,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {Math.round(b.ratio * 100)}
              </Text>
            </MiniDonut>
            <Text
              numberOfLines={1}
              className="mt-2 w-full text-center"
              style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 11 }}
            >
              {b.categoryName}
            </Text>
            <View className="mt-1 rounded-full px-1.5 py-0.5" style={{ backgroundColor: softToneFor(b.state) }}>
              <Text
                numberOfLines={1}
                style={{
                  color: toneFor(b.state),
                  fontFamily: fonts.medium,
                  fontSize: 9,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatINRCompact(b.spentPaise)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}
