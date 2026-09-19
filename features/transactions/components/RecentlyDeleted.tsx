import { Alert, Text, View } from 'react-native';
import { RotateCcw, Trash2 } from 'lucide-react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { RETENTION_DAYS, daysLeft } from '@/db/retention';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PressableScale } from '@/components/ui/PressableScale';
import { colorForName } from '@/lib/categoryColor';
import { formatDayMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { fonts, useColors, withAlpha } from '@/lib/theme';
import { useToday } from '@/lib/today';
import {
  deleteTransactionsForever,
  restoreTransactions,
  softDeleteTransactions,
  useDeletedTransactions,
  type DeletedTransactionRow,
} from '../queries';

/**
 * Settings → Recently deleted (TASKS2 5C).
 *
 * Deleting a transaction has always been soft — that is what powers Undo —
 * but nothing ever removed the rows, and once the Undo toast was gone there
 * was no way back. Now a deletion is kept for RETENTION_DAYS, listed here
 * with how long it has left, and purged at launch after that (db/retention.ts).
 *
 * Import-batch rows are not listed: they are restored with their batch.
 */
export function RecentlyDeleted() {
  const colors = useColors();
  const today = useToday();
  const { data: rows, status } = useDeletedTransactions();

  const restore = (row: DeletedTransactionRow) => {
    if (!restoreTransactions([row.id]).ok) return;
    toast.success('Transaction restored', {
      // Restoring from here is itself undoable, so a mis-tap costs nothing.
      action: { label: 'Undo', onClick: () => void softDeleteTransactions([row.id]) },
    });
  };

  const removeForever = (row: DeletedTransactionRow) => {
    Alert.alert(
      'Delete permanently?',
      `${formatINR(row.amountPaise)}${row.note ? ` · ${row.note}` : ''} will be gone for good. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (deleteTransactionsForever([row.id]).ok) toast.success('Deleted permanently');
          },
        },
      ],
    );
  };

  const emptyAll = () => {
    Alert.alert(
      `Delete all ${rows.length} permanently?`,
      'Everything in Recently deleted will be gone for good. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: () => {
            if (deleteTransactionsForever(rows.map((r) => r.id)).ok) toast.success('Recently deleted emptied');
          },
        },
      ],
    );
  };

  return (
    <Screen
      back
      title="Recently deleted"
      subtitle={`Kept for ${RETENTION_DAYS} days, then removed for good`}
      right={
        rows.length > 1 ? (
          <PressableScale accessibilityRole="button" onPress={emptyAll} className="px-2 py-2">
            <Text style={{ color: colors.expense, fontFamily: fonts.semibold, fontSize: 14 }}>Empty</Text>
          </PressableScale>
        ) : undefined
      }
    >
      <View className="px-5" style={{ paddingBottom: 40 }}>
        {status === 'pending' ? null : rows.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Nothing deleted recently"
            description={`Transactions you delete stay here for ${RETENTION_DAYS} days, so you can bring them back.`}
          />
        ) : (
          <Card>
            {rows.map((row, i) => (
              <Animated.View
                key={row.id}
                entering={FadeInDown.delay(Math.min(i, 8) * 30).duration(280)}
                exiting={FadeOut.duration(160)}
                layout={LinearTransition}
              >
                <DeletedRow
                  row={row}
                  first={i === 0}
                  left={daysLeft(row.deletedAt, today)}
                  onRestore={() => restore(row)}
                  onDelete={() => removeForever(row)}
                />
              </Animated.View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

function DeletedRow({
  row,
  first,
  left,
  onRestore,
  onDelete,
}: {
  row: DeletedTransactionRow;
  first: boolean;
  left: number;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const color = row.categoryColor ?? colorForName(row.categoryName ?? 'Uncategorised');
  const income = row.type === 'income';
  const urgent = left <= 3;

  return (
    <View
      className="flex-row items-center gap-3 px-4 py-3"
      style={first ? undefined : { borderTopWidth: 1, borderTopColor: colors.border }}
    >
      <CategoryIcon icon={row.categoryIcon} color={color} size={36} />
      <View className="flex-1">
        <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14 }}>
          {row.note?.trim() || row.categoryName || 'Uncategorised'}
        </Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>
          {income ? '+' : '−'}
          {formatINR(row.amountPaise)} · {formatDayMonth(row.date)} {row.date.slice(0, 4)}
        </Text>
        <Text
          style={{
            color: urgent ? colors.expense : colors.subtle,
            fontFamily: urgent ? fonts.medium : fonts.regular,
            fontSize: 11,
            marginTop: 2,
          }}
        >
          {left === 0 ? 'Removed at next launch' : `${left} ${left === 1 ? 'day' : 'days'} left`}
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Restore"
        onPress={onRestore}
        scaleTo={0.9}
        className="h-9 flex-row items-center gap-1.5 rounded-full border px-3"
        style={{ borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft }}
      >
        <RotateCcw size={14} color={colors.primary} />
        <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 12 }}>Restore</Text>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Delete permanently"
        onPress={onDelete}
        scaleTo={0.88}
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: withAlpha(colors.expense, 0.12) }}
      >
        <Trash2 size={15} color={colors.expense} />
      </PressableScale>
    </View>
  );
}
