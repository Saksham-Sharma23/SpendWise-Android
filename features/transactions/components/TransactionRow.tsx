import { Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { LedgerRow } from '../../../components/ui/LedgerRow';
import { PressableScale } from '../../../components/ui/PressableScale';
import { colors, fonts } from '../../../lib/theme';
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
 * Deterministic colour per category name, for categories without a stored
 * colour. Seeded categories carry their own; this is the fallback.
 */
const PALETTE = ['#E8833A', '#3A7CA5', '#8B5FBF', '#D4A32C', '#D4544E', '#4B9B6E', '#4E86C7', '#C2548A'];

export function colorForCategory(name: string | null): string {
  if (!name) return colors.muted;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function RightAction({ onPress }: { onPress: () => void }) {
  return (
    <View className="justify-center pr-5">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Delete transaction"
        onPress={onPress}
        scaleTo={0.9}
        className="h-14 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: colors.expense }}
      >
        <Trash2 size={19} color={colors.background} strokeWidth={2.3} />
        <Text style={{ color: colors.background, fontFamily: fonts.semibold, fontSize: 10, marginTop: 2 }}>
          Delete
        </Text>
      </PressableScale>
    </View>
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
  const body = (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={selectionMode ? { selected } : undefined}
      onPress={() => onPress(row.id)}
      onLongPress={onLongPress ? () => onLongPress(row.id) : undefined}
      delayLongPress={300}
      scaleTo={0.98}
      className="mx-3 rounded-2xl px-3 py-3"
      style={{ backgroundColor: selected ? colors.primarySoft : colors.background }}
    >
      <LedgerRow
        row={{ ...row, categoryColor: row.categoryColor ?? colorForCategory(row.categoryName) }}
        selected={selectionMode && selected}
      />
    </PressableScale>
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
