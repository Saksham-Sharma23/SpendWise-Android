import { useRouter } from 'expo-router';
import { Handshake } from 'lucide-react-native';
import { View } from 'react-native';

import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { MONTHS_LONG, MONTHS_SHORT } from '@/lib/dates';
import { deterministicColor, deterministicIcon } from '@/lib/identity';
import { useColors, withAlpha } from '@/lib/theme';
import { removeSettlements, undoRemoveSettlements } from '../data/actions';
import { toastWithUndo } from './undoToast';
import type { ActivityRow, PersonRow } from '../data/hooks';
import { expenseEffect, paidLine, settlementLine } from '../domain/wording';
import { toneColor } from './kit';
import { Text } from '@/components/ui/Text';

/**
 * A group's activity, Splitwise-style: month headers; each row has the date
 * on the left, what happened in the middle, and what it did to YOUR balance on
 * the right. Tap an expense to edit it; long-press a payment to delete it.
 */
export function ActivityList({
  rows,
  people,
  selfId,
  hasMore,
  onShowMore,
}: {
  rows: ActivityRow[];
  people: Map<number, PersonRow>;
  selfId: number;
  hasMore: boolean;
  onShowMore: () => void;
}) {
  const colors = useColors();
  let lastMonth = '';

  return (
    <View>
      {rows.map((row) => {
        const month = row.date.slice(0, 7);
        const header = month !== lastMonth;
        lastMonth = month;
        return (
          <View key={`${row.kind}-${row.id}`}>
            {header ? (
              <Text weight="semibold" size={13} tone="muted" style={{ marginTop: 14, marginBottom: 6 }}>
                {MONTHS_LONG[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
              </Text>
            ) : null}
            {row.kind === 'expense' ? (
              <ExpenseRow row={row} people={people} selfId={selfId} />
            ) : (
              <SettlementRow row={row} people={people} selfId={selfId} />
            )}
          </View>
        );
      })}
      {hasMore ? (
        <PressableScale
          accessibilityRole="button"
          onPress={onShowMore}
          className="mt-3 items-center rounded-full py-3"
          style={{ backgroundColor: colors.card }}
        >
          <Text weight="semibold" size={13} tone="primary">
            Show older
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function DateBlock({ date }: { date: string }) {
  return (
    <View style={{ width: 34 }} className="items-center">
      <Text weight="medium" size={10} tone="subtle">
        {MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}
      </Text>
      <Text weight="bold" size={17} tone="default" style={{ marginTop: -2 }}>
        {Number(date.slice(8, 10))}
      </Text>
    </View>
  );
}

function ExpenseRow({ row, people, selfId }: { row: ActivityRow; people: Map<number, PersonRow>; selfId: number }) {
  const colors = useColors();
  const router = useRouter();
  const effect = expenseEffect(row.youPaidPaise, row.youOwePaise);
  const lead = row.leadPayerId != null ? people.get(row.leadPayerId) : undefined;
  const title = row.title ?? 'Expense';
  const icon = row.icon ?? deterministicIcon(title);
  const color = row.color ?? deterministicColor(title);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityHint="Opens the expense"
      onPress={() => router.push({ pathname: '/(modals)/split-expense', params: { id: String(row.id) } })}
      scaleTo={0.98}
      className="flex-row items-center gap-3 py-2.5"
      // Expenses you weren't part of recede, as in Splitwise.
      style={{ opacity: row.youPaidPaise === 0 && row.youOwePaise === 0 ? 0.6 : 1 }}
    >
      <DateBlock date={row.date} />
      <CategoryIcon icon={icon} color={color} size={40} />
      <View className="flex-1">
        <Text variant="bodyStrong" tone="default" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 1 }}>
          {paidLine(lead?.name ?? null, row.leadPayerId === selfId, row.payerCount, row.amountPaise)}
        </Text>
      </View>
      <View className="items-end" style={{ minWidth: 86 }}>
        <Text weight="medium" size={11} style={{ color: toneColor(effect.tone, colors) }}>
          {effect.text}
        </Text>
        {effect.amount ? (
          <Text variant="amount" weight="bold" size={15} style={{ color: toneColor(effect.tone, colors) }}>
            {effect.amount}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

function SettlementRow({ row, people, selfId }: { row: ActivityRow; people: Map<number, PersonRow>; selfId: number }) {
  const colors = useColors();
  const from = row.fromId != null ? people.get(row.fromId) : undefined;
  const to = row.toId != null ? people.get(row.toId) : undefined;
  const text = settlementLine(
    from?.name ?? 'Someone',
    to?.name ?? 'someone',
    row.amountPaise,
    row.fromId === selfId,
    row.toId === selfId,
  );

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityHint="Long press to delete this payment"
      onLongPress={() => {
        if (removeSettlements([row.id]).ok) toastWithUndo('Payment deleted', () => undoRemoveSettlements([row.id]));
      }}
      delayLongPress={350}
      scaleTo={0.98}
      className="flex-row items-center gap-3 py-2.5"
    >
      <DateBlock date={row.date} />
      <View
        className="items-center justify-center rounded-2xl"
        style={{ width: 40, height: 40, backgroundColor: withAlpha(colors.income, 0.14) }}
      >
        <Handshake size={19} color={colors.income} strokeWidth={2.1} />
      </View>
      <View className="flex-1">
        <Text weight="medium" size={14} tone="default" numberOfLines={2}>
          {text}
        </Text>
        {row.title ? (
          <Text variant="caption" tone="subtle" numberOfLines={1} style={{ marginTop: 1 }}>
            {row.title}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}
