import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, Repeat, StickyNote, Trash2, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { PressableScale } from '../../components/ui/PressableScale';
import { Segmented } from '../../components/ui/Segmented';
import { colorForCategory } from '../../features/transactions/components/TransactionRow';
import {
  createTransaction,
  getTransaction,
  restoreTransactions,
  softDeleteTransaction,
  updateTransaction,
  useCategories,
} from '../../features/transactions/queries';
import {
  emptyTransactionForm,
  toTransactionInput,
  transactionFormSchema,
  type TransactionFormValues,
} from '../../features/transactions/schema';
import { addDays, formatDayMonth, todayISO } from '../../lib/dates';
import { paiseToDecimalString } from '../../lib/money';
import { colors, fonts, withAlpha } from '../../lib/theme';

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

function dateLabel(date: string): string {
  const today = todayISO();
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
  return `${weekday}, ${formatDayMonth(date)} ${date.slice(0, 4)}`;
}

export default function TransactionModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;

  const { data: categories = [] } = useCategories();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: emptyTransactionForm(todayISO()),
    mode: 'onTouched',
  });

  // Load the existing row when editing. Amount is rendered back through
  // paiseToDecimalString rather than a float division, so a value never
  // changes just by being opened and saved again.
  useEffect(() => {
    if (editingId == null) return;
    const row = getTransaction(editingId);
    if (!row) {
      toast.error('That transaction no longer exists');
      router.back();
      return;
    }
    reset({
      type: row.type,
      amount: paiseToDecimalString(row.amountPaise),
      date: row.date,
      categoryId: row.categoryId,
      note: row.note ?? '',
      isRecurring: row.isRecurring,
    });
  }, [editingId, reset, router]);

  const type = watch('type');
  const date = watch('date');
  const isIncome = type === 'income';
  const tone = isIncome ? colors.income : colors.expense;

  const onSubmit = (values: TransactionFormValues) => {
    const input = toTransactionInput(values);
    if (editingId != null) {
      updateTransaction(editingId, input);
      toast.success('Transaction updated');
    } else {
      createTransaction(input);
      toast.success(isIncome ? 'Income added' : 'Expense added');
    }
    // No cache to invalidate: useLiveQuery re-runs every subscribed query on
    // write, so the ledger and dashboard are already correct by now.
    router.back();
  };

  const onDelete = () => {
    if (editingId == null) return;
    const id = editingId;
    softDeleteTransaction(id);
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
                onChange={field.onChange}
                options={[
                  { value: 'expense', label: 'Expense', tint: colors.expense, onTint: colors.background },
                  { value: 'income', label: 'Income', tint: colors.income, onTint: colors.background },
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
          <Label>Category</Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <View className="flex-row flex-wrap gap-2">
                {categories.map((c) => {
                  const on = field.value === c.id;
                  const color = c.color ?? colorForCategory(c.name);
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
            <RoundButton label="Previous day" onPress={() => setValue('date', addDays(date, -1), { shouldValidate: true })} plain>
              <ChevronLeft size={18} color={colors.foreground} />
            </RoundButton>
            <View className="flex-1 flex-row items-center justify-center gap-2">
              <CalendarDays size={16} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>{dateLabel(date)}</Text>
            </View>
            <RoundButton label="Next day" onPress={() => setValue('date', addDays(date, 1), { shouldValidate: true })} plain>
              <ChevronRight size={18} color={colors.foreground} />
            </RoundButton>
          </View>
          <View className="mt-2 flex-row gap-2">
            {[
              { label: 'Today', value: todayISO() },
              { label: 'Yesterday', value: addDays(todayISO(), -1) },
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

          <Controller
            control={control}
            name="isRecurring"
            render={({ field }) => (
              <View
                className="flex-row items-center rounded-2xl border px-4 py-3"
                style={{ backgroundColor: colors.card, borderColor: colors.border }}
              >
                <Repeat size={17} color={field.value ? colors.primary : colors.muted} />
                <View className="ml-3 flex-1 pr-3">
                  <Text style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 15 }}>Recurring</Text>
                  <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>
                    Marks the entry only — no future copies are created.
                  </Text>
                </View>
                <Switch
                  value={field.value}
                  onValueChange={field.onChange}
                  trackColor={{ false: colors.elevated, true: withAlpha(colors.primary, 0.45) }}
                  thumbColor={field.value ? colors.primary : colors.muted}
                />
              </View>
            )}
          />
        </Animated.View>
      </ScrollView>

      <View className="px-5 pt-3" style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        <PressableScale
          accessibilityRole="button"
          disabled={isSubmitting}
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
