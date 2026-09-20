import { Trash2 } from 'lucide-react-native';
import { memo } from 'react';
import { View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { LedgerRow } from '@/components/ui/LedgerRow';
import { PressableScale } from '@/components/ui/PressableScale';
import { usePerfFlags } from '@/lib/perfFlags';
import { useColors } from '@/lib/theme';
import { type TransactionRow as Row } from '../data/sql';
import { Text } from '@/components/ui/Text';

/**
 * One ledger row.
 *
 * Swipe-left reveals delete — the mobile idiom replacing the web table's row
 * menu, which has no touch equivalent. The delete is soft and paired with an
 * undo toast (see the ledger), so the gesture is safe to trigger by accident.
 *
 * `row.categoryColor` must already be resolved (the ledger fills the
 * fallback once per fetch), so rendering never allocates a new row object.
 */

interface Props {
  row: Row;
  onPress: (id: number) => void;
  onDelete: (row: Row) => void;
  selected?: boolean;
  selectionMode?: boolean;
  onLongPress?: (id: number) => void;
}

function RightAction({ onPress }: { onPress: () => void }) {
  const colors = useColors();
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
        <Trash2 size={19} color={colors.onAccent} strokeWidth={2.3} />
        <Text weight="semibold" size={10} tone="onAccent" style={{ marginTop: 2 }}>
          Delete
        </Text>
      </PressableScale>
    </View>
  );
}

function TransactionRowBase({ row, onPress, onDelete, selected = false, selectionMode = false, onLongPress }: Props) {
  const colors = useColors();
  // Dev-only A/B for R5-4; always true in release (lib/perfFlags.ts).
  const swipeable = usePerfFlags((s) => s.swipeable);
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
      <LedgerRow row={row} selected={selectionMode && selected} />
    </PressableScale>
  );

  // Swiping while multi-selecting would fight the selection gesture, so the
  // row is plain until selection mode ends.
  if (selectionMode || !swipeable) return body;

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

/**
 * Every live-query re-run produces NEW row objects, so a default `memo`
 * (reference equality) would re-render every visible row on every write.
 * Compare the fields that are actually drawn instead: an edit re-renders one
 * row, a selection tap re-renders one row.
 */
function sameRow(a: Props, b: Props): boolean {
  const x = a.row;
  const y = b.row;
  return (
    x.id === y.id &&
    x.amountPaise === y.amountPaise &&
    x.type === y.type &&
    x.date === y.date &&
    x.note === y.note &&
    x.categoryId === y.categoryId &&
    x.categoryName === y.categoryName &&
    x.categoryColor === y.categoryColor &&
    x.categoryIcon === y.categoryIcon &&
    a.selected === b.selected &&
    a.selectionMode === b.selectionMode &&
    a.onPress === b.onPress &&
    a.onDelete === b.onDelete &&
    a.onLongPress === b.onLongPress
  );
}

export const TransactionRowItem = memo(TransactionRowBase, sameRow);
