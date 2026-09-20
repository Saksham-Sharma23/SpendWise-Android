import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Pause, Play } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { CategoryChip } from '@/components/ui/CategoryChip';
import { ErrorText } from '@/components/ui/Field';
import { FormModal, useSubmitOnce } from '@/components/ui/FormModal';
import { PressableScale } from '@/components/ui/PressableScale';
import { Section } from '@/components/ui/Section';
import { Text } from '@/components/ui/Text';
import { formatDayMonth, getCycleWindow } from '@/lib/dates';
import { paiseToDecimalString } from '@/lib/money';
import { useColors } from '@/lib/theme';
import { useToday } from '@/lib/today';
import { BudgetAmountDial } from '../components/BudgetAmountDial';
import { createBudget, getBudget, restoreBudget, softDeleteBudget, updateBudget } from '../data/actions';
import { useBudgetableCategories } from '../data/hooks';
import { budgetFormSchema, emptyBudgetForm, toBudgetInput, type BudgetFormValues } from '../schema';

/**
 * Set or edit a budget.
 *
 * The reset day is the part people get wrong, so the form shows the window it
 * produces ("15 Mar → 14 Apr") rather than leaving the user to work out what
 * "resets on the 15th" means in a 30-day month.
 */

const RESET_DAYS = [1, 5, 10, 15, 20, 25, 31];

/** Each block rises 60 ms after the one above it. */
const STAGGER = { base: 0, step: 60 };

export function BudgetForm({ editingId }: { editingId: number | null }) {
  const colors = useColors();
  const router = useRouter();
  const today = useToday();

  // Read synchronously before first paint, as the transaction form does, so
  // the fields never flash their defaults.
  const [initial] = useState(() => (editingId != null ? getBudget(editingId) : undefined));
  const missing = editingId != null && !initial;

  // While editing, the budget's own category must stay in the list even
  // though it already has a budget.
  const { data: categories } = useBudgetableCategories(editingId ?? undefined);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: initial
      ? {
          categoryId: initial.categoryId,
          limit: paiseToDecimalString(initial.limitPaise),
          resetDay: initial.resetDay,
          isActive: initial.isActive,
        }
      : emptyBudgetForm(),
    mode: 'onTouched',
  });

  const resetDay = watch('resetDay');
  const isActive = watch('isActive');
  const window = getCycleWindow(resetDay, today);

  const { submit, run, busy } = useSubmitOnce((values: BudgetFormValues) => {
    const input = toBudgetInput(values);
    const result = editingId != null ? updateBudget(editingId, input) : createBudget(input);
    if (result.ok) {
      toast.success(editingId != null ? 'Budget updated' : 'Budget set');
      router.back();
    }
    return result;
  });

  const onDelete = () => {
    if (editingId == null) return;
    const id = editingId;
    run(() => {
      const result = softDeleteBudget(id);
      if (result.ok) {
        toast.success('Budget deleted', { action: { label: 'Undo', onClick: () => restoreBudget(id) } });
        router.back();
      }
      return result;
    });
  };

  return (
    <FormModal
      title={editingId != null ? 'Edit budget' : 'New budget'}
      onDelete={editingId != null ? onDelete : undefined}
      deleteLabel="Delete budget"
      missing={missing ? 'That budget no longer exists' : undefined}
      primary={{ label: editingId != null ? 'Save changes' : 'Set budget', onPress: handleSubmit(submit), busy }}
    >
      <Section index={0} stagger={STAGGER} className="py-5">
        <Controller
          control={control}
          name="limit"
          render={({ field }) => (
            <BudgetAmountDial value={field.value} onChange={field.onChange} autoFocusKeypad={false} />
          )}
        />
        {errors.limit?.message ? <ErrorText>{errors.limit.message}</ErrorText> : null}
      </Section>

      <Section index={1} stagger={STAGGER} className="" label="Category">
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-2">
              {categories.map((c) => (
                <CategoryChip
                  key={c.id}
                  category={c}
                  selected={field.value === c.id}
                  onPress={() => field.onChange(c.id)}
                />
              ))}
            </View>
          )}
        />
        {categories.length === 0 ? (
          <Text weight="regular" size={13} tone="muted">
            Every expense category already has a budget. Edit one instead, or add a new category first.
          </Text>
        ) : null}
        {errors.categoryId?.message ? <ErrorText>{errors.categoryId.message}</ErrorText> : null}
      </Section>

      <Section index={2} stagger={STAGGER} className="mt-6" label="Resets on">
        <View className="flex-row flex-wrap gap-2">
          {RESET_DAYS.map((d) => {
            const on = resetDay === d;
            return (
              <PressableScale
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setValue('resetDay', d, { shouldValidate: true })}
                scaleTo={0.92}
                className="h-11 items-center justify-center rounded-2xl border px-4"
                style={{
                  borderColor: on ? colors.primaryBorder : colors.border,
                  backgroundColor: on ? colors.primarySoft : colors.card,
                }}
              >
                <Text variant="amount" weight={on ? 'semibold' : 'medium'} size={14} tone={on ? 'primary' : 'muted'}>
                  {d === 31 ? 'Month end' : ordinal(d)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        {/* The window this produces, spelled out — "the 15th" is ambiguous. */}
        <Text variant="caption" tone="subtle" style={{ marginTop: 10 }}>
          This cycle runs {formatDayMonth(window.start)} → {formatDayMonth(window.end)} ({window.daysTotal} days)
        </Text>
        {errors.resetDay?.message ? <ErrorText>{errors.resetDay.message}</ErrorText> : null}
      </Section>

      {editingId != null ? (
        <Section index={3} stagger={STAGGER} className="mt-6" label="Status">
          <PressableScale
            accessibilityRole="switch"
            accessibilityState={{ checked: isActive }}
            onPress={() => setValue('isActive', !isActive, { shouldValidate: true })}
            scaleTo={0.98}
            className="flex-row items-center gap-3 rounded-2xl border p-4"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            {isActive ? <Pause size={18} color={colors.muted} /> : <Play size={18} color={colors.primary} />}
            <View className="flex-1">
              <Text weight="semibold" size={14} tone="default">
                {isActive ? 'Pause this budget' : 'Resume this budget'}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {isActive
                  ? 'It stays in the list but stops warning you or counting towards totals'
                  : 'It will warn you again at 75% and count towards totals'}
              </Text>
            </View>
          </PressableScale>
        </Section>
      ) : null}
    </FormModal>
  );
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
