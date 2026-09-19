import { useFilterStore, DATE_PRESETS, NO_DATES, resolveDateRange, hasActiveFilters } from '@/features/transactions';
import { useRouter } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { PressableScale } from '@/components/ui/PressableScale';
import { Segmented } from '@/components/ui/Segmented';
import { colorForName } from '@/lib/categoryColor';
import { useCategories } from '@/data/categories';
import { formatDayMonth } from '@/lib/dates';
import { useToday } from '@/lib/today';
import { fonts, useColors, withAlpha } from '@/lib/theme';
import { rise } from '@/lib/motion';

/**
 * The filter sheet.
 *
 * Every control here compiles to a SQL predicate in `buildWhere` rather than
 * to a JS `.filter()` — which is what keeps filtering instant on a ledger of
 * any size.
 *
 * A preset is stored as its NAME, never as the dates it happened to mean when
 * it was tapped; `buildWhere` resolves it against today on every run. A custom
 * range is the other shape, and the two are mutually exclusive.
 */

type TypeFilter = 'all' | 'income' | 'expense';

export default function FiltersModal() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const { filters, patch, reset } = useFilterStore();
  const { data: categories = [] } = useCategories();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const selectedCats = filters.categoryIds ?? [];
  const active = hasActiveFilters(filters);
  const custom = filters.datePreset == null && (filters.dateFrom != null || filters.dateTo != null);
  const range = resolveDateRange(filters, today);

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
              { value: 'income', label: 'Income', tint: colors.income, onTint: colors.onAccent },
              { value: 'expense', label: 'Expense', tint: colors.expense, onTint: colors.onAccent },
            ]}
          />
        </Section>

        <Section label="Date range" index={1}>
          <View className="flex-row flex-wrap gap-2">
            {DATE_PRESETS.map((p) => {
              const on = filters.datePreset === p.value;
              return (
                <PressableScale
                  key={p.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  scaleTo={0.94}
                  onPress={() => patch(on ? NO_DATES : { ...NO_DATES, datePreset: p.value })}
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

          {/* A custom range for anything the presets cannot say — "March 2025". */}
          <View className="mt-3 flex-row items-center gap-2">
            <Bound
              label="From"
              value={custom ? filters.dateFrom : undefined}
              placeholder="Start"
              onPress={() => setPicking('from')}
            />
            <Text style={{ color: colors.subtle, fontFamily: fonts.medium, fontSize: 13 }}>→</Text>
            <Bound
              label="To"
              value={custom ? filters.dateTo : undefined}
              placeholder="Today"
              onPress={() => setPicking('to')}
            />
          </View>

          <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginTop: 10 }}>
            {filters.datePreset
              ? `${DATE_PRESETS.find((p) => p.value === filters.datePreset)?.label}: ${describe(range.from)} – ${describe(range.to)}`
              : range.from || range.to
                ? `${describe(range.from)} – ${describe(range.to)}`
                : 'Showing all time'}
          </Text>

          <DatePickerSheet
            visible={picking != null}
            value={(picking === 'to' ? filters.dateTo : filters.dateFrom) ?? today}
            today={today}
            title={picking === 'to' ? 'Up to' : 'From'}
            onSelect={(d) => {
              // Choosing either bound replaces a preset: the two shapes never
              // coexist, or which one wins becomes a guess.
              const base = custom ? { dateFrom: filters.dateFrom, dateTo: filters.dateTo } : {};
              const next = picking === 'to' ? { ...base, dateTo: d } : { ...base, dateFrom: d };
              // Keep the bounds in order however they were entered.
              if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) {
                patch({ ...NO_DATES, dateFrom: next.dateTo, dateTo: next.dateFrom });
              } else {
                patch({ ...NO_DATES, ...next });
              }
              setPicking(null);
            }}
            onClose={() => setPicking(null)}
          />
        </Section>

        <Section label={`Categories${selectedCats.length ? ` · ${selectedCats.length}` : ''}`} index={2}>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((c) => {
              const on = selectedCats.includes(c.id);
              const color = c.color ?? colorForName(c.name);
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
                    style={{
                      color: on ? colors.foreground : colors.muted,
                      fontFamily: on ? fonts.semibold : fonts.medium,
                      fontSize: 13,
                    }}
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

      <View
        className="px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
      >
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

/** One end of a custom range. Empty until the user sets it. */
function Bound({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const set = value != null;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${set ? value : placeholder}. Opens a calendar`}
      onPress={onPress}
      scaleTo={0.96}
      className="flex-1 rounded-2xl border px-3 py-2.5"
      style={{
        borderColor: set ? colors.primaryBorder : colors.border,
        backgroundColor: set ? colors.primarySoft : colors.elevated,
      }}
    >
      <Text style={{ color: colors.subtle, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      <Text
        numberOfLines={1}
        style={{ color: set ? colors.primary : colors.muted, fontFamily: fonts.semibold, fontSize: 13, marginTop: 2 }}
      >
        {set ? `${formatDayMonth(value)} ${value.slice(0, 4)}` : placeholder}
      </Text>
    </PressableScale>
  );
}

/** A bound as a label, or the open end it stands for. */
function describe(date?: string): string {
  return date ? `${formatDayMonth(date)} ${date.slice(0, 4)}` : 'all time';
}

function Section({ label, index, children }: { label: string; index: number; children: ReactNode }) {
  const colors = useColors();
  return (
    <Animated.View entering={rise(index * 60)} className="mt-6">
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
