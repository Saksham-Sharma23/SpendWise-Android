import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { TextInput, View } from 'react-native';
import { toast } from 'sonner-native';

import { Button } from '@/components/ui/Button';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { Chip } from '@/components/ui/Chip';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { ErrorText } from '@/components/ui/Field';
import { FormModal, useSubmitOnce } from '@/components/ui/FormModal';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Text, font } from '@/components/ui/Text';
import { useCategories } from '@/data/categories';
import { addDays, formatDayMonth } from '@/lib/dates';
import { paiseToDecimalString } from '@/lib/money';
import { useColors } from '@/lib/theme';
import { useToday } from '@/lib/today';
import {
  createTransaction,
  getTransaction,
  restoreTransactions,
  softDeleteTransaction,
  updateTransaction,
} from '../data/actions';
import { emptyTransactionForm, toTransactionInput, transactionFormSchema, type TransactionFormValues } from '../schema';

/**
 * Add / edit a transaction.
 *
 * The Expense/Income switch sits at the very top, matching the web app: type
 * is the first decision, and it changes what the amount means, so it belongs
 * where the thumb lands before anything is typed.
 *
 * The amount stays a STRING all the way to `toTransactionInput`, which parses
 * it directly to integer paise. Nothing here ever builds a float.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Each block rises 60 ms after the one above it. */
const STAGGER = { base: 0, step: 60 };

function dateLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
  return `${weekday}, ${formatDayMonth(date)} ${date.slice(0, 4)}`;
}

export function TransactionForm({ editingId }: { editingId: number | null }) {
  const colors = useColors();
  const router = useRouter();
  // Moves at midnight, so an add form left open overnight defaults to the right day.
  const today = useToday();

  const { data: categories = [] } = useCategories();

  // Read the edited row BEFORE the first paint (it is a synchronous local
  // read), so the form never flashes empty defaults — and never animates them.
  const [initial] = useState(() => (editingId != null ? getTransaction(editingId) : undefined));
  const missing = editingId != null && !initial;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: initial
      ? {
          type: initial.type,
          // Rendered back through paiseToDecimalString rather than a float
          // division, so a value never changes just by being opened and saved.
          amount: paiseToDecimalString(initial.amountPaise),
          date: initial.date,
          categoryId: initial.categoryId,
          note: initial.note ?? '',
        }
      : emptyTransactionForm(today),
    mode: 'onTouched',
  });

  const type = watch('type');
  const date = watch('date');
  const isIncome = type === 'income';
  const tone = isIncome ? colors.income : colors.expense;
  const [pickingDate, setPickingDate] = useState(false);

  // Only categories that make sense for the chosen type: "Salary" has no
  // business on an expense (TASKS2 [U3]). `kind` comes from migration 0001.
  const choices = useMemo(() => categories.filter((c) => c.kind === 'both' || c.kind === type), [categories, type]);

  /** Switching type drops a selection the new type cannot hold. */
  const onTypeChange = (next: TransactionFormValues['type'], apply: (v: string) => void) => {
    apply(next);
    const chosenId = getValues('categoryId');
    const chosen = categories.find((c) => c.id === chosenId);
    if (chosen && chosen.kind !== 'both' && chosen.kind !== next) {
      setValue('categoryId', null, { shouldValidate: true });
    }
  };

  // One write however hard Save is hammered (lib/submitGate); delete shares the gate.
  const { submit, run, busy } = useSubmitOnce((values: TransactionFormValues) => {
    const input = toTransactionInput(values);
    const result = editingId != null ? updateTransaction(editingId, input) : createTransaction(input);
    // On failure safeWrite already showed why; the form stays open so nothing typed is lost.
    if (result.ok) {
      toast.success(editingId != null ? 'Transaction updated' : isIncome ? 'Income added' : 'Expense added');
      // No cache to invalidate: live queries re-run on write.
      router.back();
    }
    return result;
  });

  const onDelete = () => {
    if (editingId == null) return;
    const id = editingId;
    run(() => {
      const result = softDeleteTransaction(id);
      if (result.ok) {
        toast.success('Transaction deleted', { action: { label: 'Undo', onClick: () => restoreTransactions([id]) } });
        router.back();
      }
      return result;
    });
  };

  return (
    <FormModal
      title={editingId != null ? 'Edit transaction' : 'New transaction'}
      onDelete={editingId != null ? onDelete : undefined}
      deleteLabel="Delete transaction"
      missing={missing ? 'That transaction no longer exists' : undefined}
      primary={{
        label: editingId != null ? 'Save changes' : isIncome ? 'Add income' : 'Add expense',
        onPress: handleSubmit(submit),
        busy,
        glow: true,
      }}
    >
      {/* Type — first, because it changes what everything below means. */}
      <Section index={0} stagger={STAGGER} className="mt-2">
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Segmented
              value={field.value}
              onChange={(v) => onTypeChange(v, field.onChange)}
              options={[
                { value: 'expense', label: 'Expense', tint: colors.expense, onTint: colors.onAccent },
                { value: 'income', label: 'Income', tint: colors.income, onTint: colors.onAccent },
              ]}
            />
          )}
        />
      </Section>

      {/* Amount — the hero of the form. */}
      <Section index={1} stagger={STAGGER} className="items-center py-8">
        <Text variant="body" tone="muted">
          {isIncome ? 'How much came in?' : 'How much did you spend?'}
        </Text>
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <View className="mt-2 flex-row items-center justify-center">
              <Text weight="semibold" size={36} style={{ color: tone, marginRight: 4 }}>
                ₹
              </Text>
              <TextInput
                autoFocus={editingId == null}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.subtle}
                selectionColor={tone}
                style={{
                  ...font('bold', 48),
                  color: colors.foreground,
                  letterSpacing: -1.5,
                  minWidth: 60,
                  paddingVertical: 0,
                  fontVariant: ['tabular-nums'],
                }}
              />
            </View>
          )}
        />
        {errors.amount?.message ? <ErrorText>{errors.amount.message}</ErrorText> : null}
      </Section>

      <Section
        index={2}
        stagger={STAGGER}
        className=""
        label="Category"
        action={
          <Button
            label="Manage"
            variant="ghost"
            size="sm"
            className="mb-2.5 pl-3"
            onPress={() => router.push('/categories' as never)}
          />
        }
      >
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-2">
              {choices.map((c) => (
                <CategoryChip
                  key={c.id}
                  category={c}
                  selected={field.value === c.id}
                  onPress={() => field.onChange(field.value === c.id ? null : c.id)}
                />
              ))}
            </View>
          )}
        />
        {errors.categoryId?.message ? <ErrorText>{errors.categoryId.message}</ErrorText> : null}
      </Section>

      <Section index={3} stagger={STAGGER} className="mt-6" label="Date">
        <View
          className="flex-row items-center rounded-2xl border p-1.5"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
          <IconButton
            label="Previous day"
            look="plain"
            onPress={() => setValue('date', addDays(date, -1), { shouldValidate: true })}
          >
            <ChevronLeft size={18} color={colors.foreground} />
          </IconButton>
          {/* The label is the way into the calendar: the arrows are for
              nudging a day either side, not for backdating three months. */}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Date: ${dateLabel(date, today)}. Opens a calendar`}
            onPress={() => setPickingDate(true)}
            scaleTo={0.96}
            className="flex-1 flex-row items-center justify-center gap-2 py-2"
          >
            <CalendarDays size={16} color={colors.primary} />
            <Text variant="bodyStrong" tone="default">
              {dateLabel(date, today)}
            </Text>
          </PressableScale>
          <IconButton
            label="Next day"
            look="plain"
            onPress={() => setValue('date', addDays(date, 1), { shouldValidate: true })}
          >
            <ChevronRight size={18} color={colors.foreground} />
          </IconButton>
        </View>
        <View className="mt-2 flex-row gap-2">
          {[
            { label: 'Today', value: today },
            { label: 'Yesterday', value: addDays(today, -1) },
          ].map((d) => (
            <Chip
              key={d.label}
              label={d.label}
              size="sm"
              rest="transparent"
              selected={date === d.value}
              onPress={() => setValue('date', d.value, { shouldValidate: true })}
            />
          ))}
        </View>
        {errors.date?.message ? <ErrorText>{errors.date.message}</ErrorText> : null}
        <DatePickerSheet
          visible={pickingDate}
          value={date}
          today={today}
          title={isIncome ? 'When did it come in?' : 'When was it spent?'}
          onSelect={(d) => {
            setValue('date', d, { shouldValidate: true });
            setPickingDate(false);
          }}
          onClose={() => setPickingDate(false)}
        />
      </Section>

      <Section index={4} stagger={STAGGER} className="mt-6 gap-3" label="Details">
        <Controller
          control={control}
          name="note"
          render={({ field }) => (
            <View
              className="flex-row items-center rounded-2xl border px-4"
              style={{ backgroundColor: colors.card, borderColor: colors.border, minHeight: 52 }}
            >
              <StickyNote size={17} color={colors.muted} />
              <TextInput
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="What was it for?"
                placeholderTextColor={colors.subtle}
                selectionColor={colors.primary}
                className="ml-3 flex-1 py-3"
                style={{ ...font('regular', 15), color: colors.foreground }}
              />
            </View>
          )}
        />
        {errors.note?.message ? <ErrorText>{errors.note.message}</ErrorText> : null}
      </Section>
    </FormModal>
  );
}
