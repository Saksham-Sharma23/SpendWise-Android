import { Text, View } from 'react-native';

import { formatDayMonth } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { colors, fonts } from '../../lib/theme';
import { CategoryIcon } from './CategoryIcon';

export interface LedgerRowData {
  type: 'expense' | 'income';
  amountPaise: number;
  date: string;
  note: string | null;
  isRecurring?: boolean;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

interface Props {
  row: LedgerRowData;
  selected?: boolean;
  /** Hide the date in the subtitle — e.g. when a month/day header already shows it. */
  hideDate?: boolean;
}

/**
 * How a transaction looks, everywhere it appears: the ledger, the dashboard's
 * recent list, the import review. Purely presentational — gestures belong to
 * whoever renders it.
 */
export function LedgerRow({ row, selected = false, hideDate = false }: Props) {
  const isIncome = row.type === 'income';
  const title = row.note?.trim() || row.categoryName || 'Untitled';
  const subtitle = [
    row.categoryName ?? 'Uncategorised',
    hideDate ? null : formatDayMonth(row.date),
    row.isRecurring ? 'Recurring' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-row items-center gap-3">
      <CategoryIcon icon={row.categoryIcon} color={row.categoryColor} selected={selected} />
      <View className="flex-1 pr-2">
        <Text
          numberOfLines={1}
          style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}
        >
          {subtitle}
        </Text>
      </View>
      <Text
        style={{
          color: isIncome ? colors.income : colors.foreground,
          fontFamily: fonts.bold,
          fontSize: 15,
          fontVariant: ['tabular-nums'],
        }}
      >
        {isIncome ? '+' : '−'}
        {formatINR(row.amountPaise)}
      </Text>
    </View>
  );
}
