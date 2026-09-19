import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, StickyNote, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { useCategories } from '@/data/categories';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { PressableScale } from '@/components/ui/PressableScale';
import { Segmented } from '@/components/ui/Segmented';
import { colorForName } from '@/lib/categoryColor';
import {
  createTransaction,
  getTransaction,
  restoreTransactions,
  softDeleteTransaction,
  updateTransaction,
} from '@/features/transactions/queries';
import {
  emptyTransactionForm,
  toTransactionInput,
  transactionFormSchema,
  type TransactionFormValues,
} from '@/features/transactions/schema';
import { addDays, formatDayMonth } from '@/lib/dates';
import { useToday } from '@/lib/today';
import { paiseToDecimalString } from '@/lib/money';
import { fonts, useColors, withAlpha } from '@/lib/theme';

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

function dateLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
  return `${weekday}, ${formatDayMonth(date)} ${date.slice(0, 4)}`;
}

export default function TransactionModal() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
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

  useEffect(() => {
    if (!missing) return;
    toast.error('That transaction no longer exists');
    router.back();
  }, [missing, router]);

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

  // Double-tap guard. handleSubmit validates asynchronously, so two quick
  // taps both reach onSubmit before any re-render could disable the button —
  // and with no server, nothing would ever deduplicate the second row.
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);

  const onSubmit = (values: TransactionFormValues) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);

    const input = toTransactionInput(values);
    const result = editingId != null ? updateTransaction(editingId, input) : createTransaction(input);

    if (!result.ok) {
      // safeWrite already showed why. Stay open so nothing typed is lost.
      submitting.current = false;
      setSaving(false);
      return;
    }
    toast.success(editingId != null ? 'Transaction updated' : isIncome ? 'Income added' : 'Expense added');
    // No cache to invalidate: live queries re-run on write, so the ledger and
    // dashboard are already correct by now.
    router.back();
  };

  const onDelete = () => {
    if (editingId == null || submitting.current) return;
    const id = editingId;
    if (!softDeleteTransaction(id).ok) return;
    submitting.current = true;
    toast.success('Transaction deleted', {
      action: { label: 'Undo', onClick: () => restoreTransactions([id]) },
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center justify-between px-5 py-3">
        <RoundButton label="Close" onPress={() => router.back()}>
          <X size={19} color={colors.foreground} />
        </RoundButton>
        <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 16 }}>
          {editingId != null ? 'Edit transaction' : 'New transaction'}
        </Text>
        {editingId != null ? (
          <RoundButton label="Delete transaction" onPress={onDelete} tint={colors.expense}>
            <Trash2 size={17} color={colors.expense} />
          </RoundButton>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        className="px-5"
      >
        {/* Type — first, because it changes what everything below means. */}
        <Animated.View entering={FadeInDown.duration(350)} className="mt-2">
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
        </Animated.View>

        {/* Amount — the hero of the form. */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)} className="items-center py-8">
          <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>
            {isIncome ? 'How much came in?' : 'How much did you spend?'}
          </Text>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <View className="mt-2 flex-row items-center justify-center">
                <Text style={{ color: tone, fontFamily: fonts.semibold, fontSize: 36, marginRight: 4 }}>₹</Text>
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
                    color: colors.foreground,
                    fontFamily: fonts.bold,
                    fontSize: 48,
                    letterSpacing: -1.5,
                    minWidth: 60,
                    paddingVertical: 0,
                    fontVariant: ['tabular-nums'],
                  }}
                />
              </View>
            )}
          />
          {errors.amount?.message ? (
            <Text style={{ color: colors.expense, fontFamily: fonts.medium, fontSize: 12, marginTop: 6 }}>
              {errors.amount.message}
            </Text>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(350)}>
          <View className="flex-row items-center justify-between">
            <Label>Category</Label>
            <PressableScale
              accessibilityRole="button"
              onPress={() => router.push('/categories' as never)}
              className="mb-2.5 pl-3"
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 12 }}>Manage</Text>
            </PressableScale>
          </View>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <View className="flex-row flex-wrap gap-2">
                {choices.map((c) => {
                  const on = field.value === c.id;
                  const color = c.color ?? colorForName(c.name);
                  return (
                    <PressableScale
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => field.onChange(on ? null : c.id)}
                      scaleTo={0.94}
                      className="flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
                      style={{
                        borderColor: on ? color : colors.border,
                        backgroundColor: on ? withAlpha(color, 0.16) : colors.card,
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
            )}
          />
          {errors.categoryId?.message ? <ErrorText>{errors.categoryId.message}</ErrorText> : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(350)} className="mt-6">
          <Label>Date</Label>
          <View
            className="flex-row items-center rounded-2xl border p-1.5"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <RoundButton
              label="Previous day"
              onPress={() => setValue('date', addDays(date, -1), { shouldValidate: true })}
              plain
            >
              <ChevronLeft size={18} color={colors.foreground} />
            </RoundButton>
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
              <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
                {dateLabel(date, today)}
              </Text>
            </PressableScale>
            <RoundButton
              label="Next day"
              onPress={() => setValue('date', addDays(date, 1), { shouldValidate: true })}
              plain
            >
              <ChevronRight size={18} color={colors.foreground} />
            </RoundButton>
          </View>
          <View className="mt-2 flex-row gap-2">
            {[
              { label: 'Today', value: today },
              { label: 'Yesterday', value: addDays(today, -1) },
            ].map((d) => {
              const on = date === d.value;
              return (
                <PressableScale
                  key={d.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setValue('date', d.value, { shouldValidate: true })}
                  className="rounded-full border px-3.5 py-1.5"
                  style={{
                    borderColor: on ? colors.primaryBorder : colors.border,
                    backgroundColor: on ? colors.primarySoft : 'transparent',
                  }}
                >
                  <Text style={{ color: on ? colors.primary : colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>
                    {d.label}
                  </Text>
                </PressableScale>
              );
            })}
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
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(350)} className="mt-6 gap-3">
          <Label>Details</Label>
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
                  style={{ color: colors.foreground, fontFamily: fonts.regular, fontSize: 15 }}
                />
              </View>
            )}
          />
          {errors.note?.message ? <ErrorText>{errors.note.message}</ErrorText> : null}
        </Animated.View>
      </ScrollView>

      <View
        className="px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
      >
        <PressableScale
          accessibilityRole="button"
          disabled={saving}
          onPress={handleSubmit(onSubmit)}
          className="items-center rounded-full py-4"
          style={{
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
            shadowOpacity: 0.35,
            shadowRadius: 14,
            elevation: 6,
          }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>
            {editingId != null ? 'Save changes' : isIncome ? 'Add income' : 'Add expense'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function Label({ children }: { children: string }) {
  const colors = useColors();
  return (
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
      {children}
    </Text>
  );
}

function ErrorText({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text style={{ color: colors.expense, fontFamily: fonts.medium, fontSize: 12, marginTop: 6 }}>{children}</Text>
  );
}

function RoundButton({
  label,
  onPress,
  children,
  tint,
  plain = false,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  tint?: string;
  plain?: boolean;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.88}
      className="h-10 w-10 items-center justify-center rounded-full"
      style={
        plain
          ? { backgroundColor: colors.elevated }
          : {
              backgroundColor: tint ? withAlpha(tint, 0.12) : colors.card,
              borderWidth: 1,
              borderColor: tint ? withAlpha(tint, 0.3) : colors.border,
            }
      }
    >
      {children}
    </PressableScale>
  );
}
