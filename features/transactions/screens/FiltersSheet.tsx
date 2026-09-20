import { useRouter } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { useCategories } from '@/data/categories';
import { formatDayMonth } from '@/lib/dates';
import { useColors } from '@/lib/theme';
import { useToday } from '@/lib/today';
import { DATE_PRESETS, NO_DATES, hasActiveFilters, resolveDateRange } from '../data/filters';
import { useFilterStore } from '../filterStore';

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

/** Each section rises 60 ms after the one above it. */
const STAGGER = { base: 0, step: 60 };

export function FiltersSheet() {
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
        {/* Elevated rather than card: the sheet itself is card-coloured. */}
        <IconButton
          label="Close"
          onPress={() => router.back()}
          style={{ backgroundColor: colors.elevated, borderColor: colors.border }}
        >
          <X size={19} color={colors.foreground} />
        </IconButton>
        <Text variant="heading" tone="default">
          Filters
        </Text>
        <PressableScale accessibilityRole="button" onPress={() => reset()} disabled={!active} className="px-1 py-2">
          <Text weight="semibold" size={14} tone={active ? 'expense' : 'subtle'}>
            Reset
          </Text>
        </PressableScale>
      </View>

      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Section label="Type" index={0} stagger={STAGGER} className="mt-6">
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

        <Section label="Date range" index={1} stagger={STAGGER} className="mt-6">
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
                  <Text variant="body" tone={on ? 'primary' : 'muted'}>
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
            <Text variant="body" tone="subtle">
              →
            </Text>
            <Bound
              label="To"
              value={custom ? filters.dateTo : undefined}
              placeholder="Today"
              onPress={() => setPicking('to')}
            />
          </View>

          <Text variant="caption" tone="subtle" style={{ marginTop: 10 }}>
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

        <Section
          label={`Categories${selectedCats.length ? ` · ${selectedCats.length}` : ''}`}
          index={2}
          stagger={STAGGER}
          className="mt-6"
        >
          <View className="flex-row flex-wrap gap-2">
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                category={c}
                rest="elevated"
                selected={selectedCats.includes(c.id)}
                onPress={() => toggleCat(c.id)}
              />
            ))}
          </View>
          {categories.length === 0 ? (
            <Text weight="regular" size={13} tone="muted">
              No categories yet.
            </Text>
          ) : null}
        </Section>
      </ScrollView>

      <View
        className="px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
      >
        <Button label="Show results" onPress={() => router.back()} />
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
      <Text weight="medium" size={10} tone="subtle" style={{ letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      <Text numberOfLines={1} weight="semibold" size={13} tone={set ? 'primary' : 'muted'} style={{ marginTop: 2 }}>
        {set ? `${formatDayMonth(value)} ${value.slice(0, 4)}` : placeholder}
      </Text>
    </PressableScale>
  );
}

/** A bound as a label, or the open end it stands for. */
function describe(date?: string): string {
  return date ? `${formatDayMonth(date)} ${date.slice(0, 4)}` : 'all time';
}
