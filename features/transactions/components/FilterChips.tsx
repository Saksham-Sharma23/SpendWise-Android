import { X } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { formatDayMonth } from '@/lib/dates';
import { fonts, useColors, withAlpha } from '@/lib/theme';
import { appear, leave, reflow } from '@/lib/motion';
import { DATE_PRESETS, NO_DATES, type TransactionFilters } from '../data/filters';

interface Props {
  filters: TransactionFilters;
  categories: { id: number; name: string; color: string | null }[];
  onChange: (patch: Partial<TransactionFilters>) => void;
  onClearSearch: () => void;
  onClearAll: () => void;
}

interface Chip {
  key: string;
  label: string;
  tint?: string;
  remove: () => void;
}

/**
 * One removable chip per active filter.
 *
 * These exist so the user can see *why* the list looks the way it does — an
 * empty ledger with no visible reason reads as data loss. Each chip removes
 * exactly its own predicate, so narrowing back out is one tap, not a trip
 * into the filter sheet.
 */
export function FilterChips({ filters, categories, onChange, onClearSearch, onClearAll }: Props) {
  const colors = useColors();
  const chips: Chip[] = [];

  if (filters.search?.trim()) {
    chips.push({ key: 'search', label: `“${filters.search.trim()}”`, remove: onClearSearch });
  }
  if (filters.type && filters.type !== 'all') {
    chips.push({
      key: 'type',
      label: filters.type === 'income' ? 'Income' : 'Expense',
      tint: filters.type === 'income' ? colors.income : colors.expense,
      remove: () => onChange({ type: 'all' }),
    });
  }
  if (filters.datePreset) {
    // The preset's own name, not the dates it resolves to today — that is what
    // the user chose, and it is shorter to read at a glance.
    chips.push({
      key: 'date',
      label: DATE_PRESETS.find((p) => p.value === filters.datePreset)?.label ?? 'Date range',
      remove: () => onChange(NO_DATES),
    });
  } else if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? formatDayMonth(filters.dateFrom) : 'Start';
    const to = filters.dateTo ? formatDayMonth(filters.dateTo) : 'today';
    chips.push({
      key: 'date',
      label: `${from} – ${to}`,
      remove: () => onChange(NO_DATES),
    });
  }
  for (const id of filters.categoryIds ?? []) {
    const cat = categories.find((c) => c.id === id);
    chips.push({
      key: `cat-${id}`,
      label: cat?.name ?? 'Category',
      tint: cat?.color ?? undefined,
      remove: () => onChange({ categoryIds: (filters.categoryIds ?? []).filter((c) => c !== id) }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <Animated.View entering={appear()} exiting={leave()}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {chips.map((chip) => (
          <Animated.View key={chip.key} layout={reflow()} entering={appear()} exiting={leave()}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip.label}`}
              onPress={chip.remove}
              scaleTo={0.94}
              className="flex-row items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-2"
              style={{
                borderColor: chip.tint ? withAlpha(chip.tint, 0.45) : colors.border,
                backgroundColor: chip.tint ? withAlpha(chip.tint, 0.12) : colors.elevated,
              }}
            >
              {chip.tint ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: chip.tint }} /> : null}
              <Text
                numberOfLines={1}
                style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 12, maxWidth: 160 }}
              >
                {chip.label}
              </Text>
              <X size={13} color={colors.muted} />
            </PressableScale>
          </Animated.View>
        ))}
        {chips.length > 1 ? (
          <PressableScale accessibilityRole="button" onPress={onClearAll} className="justify-center px-2">
            <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 12 }}>Clear all</Text>
          </PressableScale>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}
