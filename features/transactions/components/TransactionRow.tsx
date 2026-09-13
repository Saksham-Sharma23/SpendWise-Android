import { Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { formatINR } from '../../../lib/money';
import type { TransactionRow as Row } from '../queries';

/**
 * One ledger row.
 *
 * Swipe-left reveals delete — the mobile idiom replacing the web table's row
 * menu, which has no touch equivalent. The delete is soft and paired with an
 * undo toast (see the list screen), so the gesture is safe to trigger by
 * accident.
 */

interface Props {
  row: Row;
  onPress: (id: number) => void;
  onDelete: (row: Row) => void;
  selected?: boolean;
  selectionMode?: boolean;
  onLongPress?: (id: number) => void;
}

/**
 * Deterministic colour per category, ported from the web app's group-utils.
 * Not persisted: the same name always yields the same hue, so both clients
 * agree without either storing a colour.
 */
const PALETTE = [
  '#0B5C4B', '#1D5C8A', '#6B3FA0', '#8A5410',
  '#8E2436', '#2F6E3B', '#345B8C', '#7A4A2B',
];

export function colorForCategory(name: string | null): string {
  if (!name) return '#6B7280';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function initials(name: string | null): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '—';
}

function RightAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Delete transaction"
      onPress={onPress}
      className="my-1 mr-4 w-20 items-center justify-center rounded-lg bg-destructive"
    >
      <Trash2 size={20} color="#fff" />
      <Text className="mt-1 text-xs text-destructive-foreground">Delete</Text>
    </Pressable>
  );
}

function TransactionRowBase({
  row,
  onPress,
  onDelete,
  selected = false,
  selectionMode = false,
  onLongPress,
}: Props) {
  const isIncome = row.type === 'income';
  const color = colorForCategory(row.categoryName);

  const body = (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(row.id)}
      onLongPress={onLongPress ? () => onLongPress(row.id) : undefined}
      delayLongPress={300}
      className={`flex-row items-center gap-3 px-5 py-3 ${selected ? 'bg-accent' : 'bg-background'}`}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: selected ? color : `${color}22` }}
      >
        <Text
          className="text-xs"
          style={{
            color: selected ? '#fff' : color,
            fontFamily: 'PlusJakartaSans_600SemiBold',
          }}
        >
          {selectionMode && selected ? '✓' : initials(row.categoryName)}
        </Text>
      </View>

      <View className="flex-1 pr-2">
        <Text
          numberOfLines={1}
          className="text-[15px] text-foreground"
          style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
        >
          {row.note?.trim() || row.categoryName || 'Untitled'}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-xs text-muted-foreground">
          {row.categoryName ?? 'Uncategorised'}
          {row.isRecurring ? ' · recurring' : ''}
        </Text>
      </View>

      <Text
        className="text-[15px]"
        style={{
          fontVariant: ['tabular-nums'],
          fontFamily: 'PlusJakartaSans_600SemiBold',
          color: isIncome ? '#15803D' : undefined,
        }}
      >
        {isIncome ? '+' : '−'}
        {formatINR(row.amountPaise, { bare: false })}
      </Text>
    </Pressable>
  );

  // Swiping while multi-selecting would fight the selection gesture, so the
  // row is plain until selection mode ends.
  if (selectionMode) return body;

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => <RightAction onPress={() => onDelete(row)} />}
    >
      {body}
    </ReanimatedSwipeable>
  );
}

export const TransactionRowItem = memo(TransactionRowBase);
