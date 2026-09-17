import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pause, Play, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { BudgetAmountDial } from '../../features/budgets/components/BudgetAmountDial';
import { PressableScale } from '../../components/ui/PressableScale';
import {
  createBudget,
  getBudget,
  restoreBudget,
  softDeleteBudget,
  updateBudget,
  useBudgetableCategories,
} from '../../features/budgets/queries';
import { budgetFormSchema, emptyBudgetForm, toBudgetInput, type BudgetFormValues } from '../../features/budgets/schema';
import { colorForName } from '../../lib/categoryColor';
import { getCycleWindow , formatDayMonth } from '../../lib/dates';
import { paiseToDecimalString } from '../../lib/money';
import { useToday } from '../../lib/today';
import { fonts, useColors, withAlpha } from '../../lib/theme';

/**
 * Set or edit a budget.
 *
 * The reset day is the part people get wrong, so the form shows the window it
 * produces ("15 Mar → 14 Apr") rather than leaving the user to work out what
 * "resets on the 15th" means in a 30-day month.
 */

const RESET_DAYS = [1, 5, 10, 15, 20, 25, 31];

export default function BudgetModal() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
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

  useEffect(() => {
    if (!missing) return;
    toast.error('That budget no longer exists');
    router.back();
  }, [missing, router]);

  const resetDay = watch('resetDay');
  const isActive = watch('isActive');
  const window = getCycleWindow(resetDay, today);

  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);

  const onSubmit = (values: BudgetFormValues) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);

    const input = toBudgetInput(values);
    const result = editingId != null ? updateBudget(editingId, input) : createBudget(input);

    if (!result.ok) {
      submitting.current = false;
      setSaving(false);
      return;
    }
    toast.success(editingId != null ? 'Budget updated' : 'Budget set');
    router.back();
  };

  const onDelete = () => {
    if (editingId == null || submitting.current) return;
    const id = editingId;
    if (!softDeleteBudget(id).ok) return;
    submitting.current = true;
    toast.success('Budget deleted', { action: { label: 'Undo', onClick: () => restoreBudget(id) } });
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
          {editingId != null ? 'Edit budget' : 'New budget'}
        </Text>
        {editingId != null ? (
          <RoundButton label="Delete budget" onPress={onDelete} tint={colors.expense}>
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
        <Animated.View entering={FadeInDown.duration(350)} className="py-5">
          <Controller
            control={control}
            name="limit"
            render={({ field }) => (
              <BudgetAmountDial value={field.value} onChange={field.onChange} autoFocusKeypad={false} />
            )}
          />
          {errors.limit?.message ? <ErrorText>{errors.limit.message}</ErrorText> : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(350)}>
          <Label>Category</Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <View className="flex-row flex-wrap gap-2">
                {categories.map((c) => {
                  const on = field.value === c.id;
                  const color = c.color ?? colorForName(c.name);
                  return (
                    <PressableScale
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => field.onChange(c.id)}
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
          {categories.length === 0 ? (
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13 }}>
              Every expense category already has a budget. Edit one instead, or add a new category first.
            </Text>
          ) : null}
          {errors.categoryId?.message ? <ErrorText>{errors.categoryId.message}</ErrorText> : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(350)} className="mt-6">
          <Label>Resets on</Label>
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
                  <Text
                    style={{
                      color: on ? colors.primary : colors.muted,
                      fontFamily: on ? fonts.semibold : fonts.medium,
                      fontSize: 14,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {d === 31 ? 'Month end' : ordinal(d)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          {/* The window this produces, spelled out — "the 15th" is ambiguous. */}
          <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginTop: 10 }}>
            This cycle runs {formatDayMonth(window.start)} → {formatDayMonth(window.end)} ({window.daysTotal} days)
          </Text>
          {errors.resetDay?.message ? <ErrorText>{errors.resetDay.message}</ErrorText> : null}
        </Animated.View>

        {editingId != null ? (
          <Animated.View entering={FadeInDown.delay(180).duration(350)} className="mt-6">
            <Label>Status</Label>
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
                <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14 }}>
                  {isActive ? 'Pause this budget' : 'Resume this budget'}
                </Text>
                <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
                  {isActive
                    ? 'It stays in the list but stops warning you or counting towards totals'
                    : 'It will warn you again at 75% and count towards totals'}
                </Text>
              </View>
            </PressableScale>
          </Animated.View>
        ) : null}
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
          style={{ backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>
            {editingId != null ? 'Save changes' : 'Set budget'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
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
  return <Text style={{ color: colors.expense, fontFamily: fonts.medium, fontSize: 12, marginTop: 6 }}>{children}</Text>;
}

function RoundButton({
  label,
  onPress,
  children,
  tint,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  tint?: string;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.88}
      className="h-10 w-10 items-center justify-center rounded-full"
      style={{
        backgroundColor: tint ? withAlpha(tint, 0.12) : colors.card,
        borderWidth: 1,
        borderColor: tint ? withAlpha(tint, 0.3) : colors.border,
      }}
    >
      {children}
    </PressableScale>
  );
}
