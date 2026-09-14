import { useRouter } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { PressableScale } from '../../components/ui/PressableScale';
import { Segmented } from '../../components/ui/Segmented';
import { colorForCategory } from '../../lib/categoryColor';
import { useFilterStore } from '../../features/transactions/filterStore';
import { hasActiveFilters, useCategories } from '../../features/transactions/queries';
import { addDays, formatDayMonth, todayISO } from '../../lib/dates';
import { colors, fonts, withAlpha } from '../../lib/theme';

/**
 * The filter sheet.
 *
 * Every control here compiles to a SQL predicate in `buildWhere` rather than
 * to a JS `.filter()` — which is what keeps filtering instant on a ledger of
 * any size, and why the date presets are stored as plain ISO bounds.
 */

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: 'Last 7 days', from: () => addDays(todayISO(), -6), to: todayISO },
  { label: 'Last 30 days', from: () => addDays(todayISO(), -29), to: todayISO },
  { label: 'This month', from: () => `${todayISO().slice(0, 7)}-01`, to: todayISO },
  { label: 'Last 12 months', from: () => addDays(todayISO(), -364), to: todayISO },
];

type TypeFilter = 'all' | 'income' | 'expense';

export default function FiltersModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { filters, patch, reset } = useFilterStore();
  const { data: categories = [] } = useCategories();

  const selectedCats = filters.categoryIds ?? [];
  const active = hasActiveFilters(filters);

  const toggleCat = (id: number) => {
    const next = selectedCats.includes(id) ? selectedCats.filter((c) => c !== id) : [...selectedCats, id];
    patch({ categoryIds: next });
  };

  return (
    // Presented as a native bottom sheet (see app/_layout.tsx), so no top safe
    // area: the sheet already starts below the status bar.
    <View className="flex-1" style={{ backgroundColor: colors.card }}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-5">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          scaleTo={0.88}
          className="h-10 w-10 items-center justify-center rounded-full border"
          style={{ backgroundColor: colors.elevated, borderColor: colors.border }}
        >
          <X size={19} color={colors.foreground} />
        </PressableScale>
        <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 16 }}>Filters</Text>
        <PressableScale accessibilityRole="button" onPress={() => reset()} disabled={!active} className="px-1 py-2">
          <Text style={{ color: active ? colors.expense : colors.subtle, fontFamily: fonts.semibold, fontSize: 14 }}>
            Reset
          </Text>
        </PressableScale>
      </View>

      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Section label="Type" index={0}>
          <Segmented<TypeFilter>
            value={(filters.type ?? 'all') as TypeFilter}
            onChange={(t) => patch({ type: t })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'Income', tint: colors.income, onTint: colors.background },
              { value: 'expense', label: 'Expense', tint: colors.expense, onTint: colors.background },
            ]}
          />
        </Section>

        <Section label="Date range" index={1}>
          <View className="flex-row flex-wrap gap-2">
            {PRESETS.map((p) => {
              const on = filters.dateFrom === p.from() && filters.dateTo === p.to();
              return (
                <PressableScale
                  key={p.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  scaleTo={0.94}
                  onPress={() =>
                    on ? patch({ dateFrom: undefined, dateTo: undefined }) : patch({ dateFrom: p.from(), dateTo: p.to() })
                  }
                  className="flex-row items-center gap-1.5 rounded-full border px-4 py-2"
                  style={{
                    borderColor: on ? colors.primaryBorder : colors.border,
                    backgroundColor: on ? colors.primarySoft : colors.elevated,
                  }}
                >
                  {on ? <Check size={14} color={colors.primary} strokeWidth={2.6} /> : null}
                  <Text style={{ color: on ? colors.primary : colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>
                    {p.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginTop: 10 }}>
            {filters.dateFrom
              ? `${formatDayMonth(filters.dateFrom)} ${filters.dateFrom.slice(0, 4)} – ${formatDayMonth(filters.dateTo ?? filters.dateFrom)} ${(filters.dateTo ?? filters.dateFrom).slice(0, 4)}`
              : 'Showing all time'}
          </Text>
        </Section>

        <Section label={`Categories${selectedCats.length ? ` · ${selectedCats.length}` : ''}`} index={2}>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((c) => {
              const on = selectedCats.includes(c.id);
              const color = c.color ?? colorForCategory(c.name);
              return (
                <PressableScale
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  scaleTo={0.94}
                  onPress={() => toggleCat(c.id)}
                  className="flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
                  style={{
                    borderColor: on ? color : colors.border,
                    backgroundColor: on ? withAlpha(color, 0.16) : colors.elevated,
                  }}
                >
                  <CategoryIcon icon={c.icon} color={color} size={26} />
                  <Text
                    style={{ color: on ? colors.foreground : colors.muted, fontFamily: on ? fonts.semibold : fonts.medium, fontSize: 13 }}
                  >
                    {c.name}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          {categories.length === 0 ? (
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>No categories yet.</Text>
          ) : null}
        </Section>
      </ScrollView>

      <View className="px-5 pt-3" style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <PressableScale
          accessibilityRole="button"
          onPress={() => router.back()}
          className="items-center rounded-full py-4"
          style={{ backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>Show results</Text>
        </PressableScale>
      </View>
    </View>
  );
}

function Section({ label, index, children }: { label: string; index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(350)} className="mt-6">
      <Text
        style={{
          color: colors.muted,
          fontFamily: fonts.semibold,
          fontSize: 12,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        {label}
      </Text>
      {children}
    </Animated.View>
  );
}
