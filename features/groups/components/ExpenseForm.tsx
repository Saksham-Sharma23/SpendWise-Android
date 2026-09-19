import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import type { SplitMethod } from '@/db/schema';
import { Avatar } from '@/components/ui/Avatar';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { Segmented } from '@/components/ui/Segmented';
import { categoryColor } from '@/lib/categoryColor';
import { addDays, formatDayMonth } from '@/lib/dates';
import { deterministicColor, deterministicIcon } from '@/lib/identity';
import { formatINR, paiseToDecimalString, parseAmountToPaise } from '@/lib/money';
import { useToday } from '@/lib/today';
import { fonts, useColors, withAlpha } from '@/lib/theme';
import { draftFromExpense, emptyDraft, evaluate, type Draft } from '../domain/draft';
import { directGroupFor, removeExpense, saveSplitExpense, undoRemoveExpense } from '../data/actions';
import { toastWithUndo } from './undoToast';
import { getExpenseForEdit, getFriends, getGroupRow, getMembers, getSelfId, useGroupsHub } from '../data/hooks';
import { formatPercent } from '../domain/split';
import { FormSheet, RoundButton, SectionLabel } from './kit';

export interface CategoryOption {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
}

type Target = { kind: 'group'; groupId: number } | { kind: 'friend'; personId: number };
type Member = { id: number; name: string; isSelf: boolean };
type SheetName = 'target' | 'paid' | 'split' | null;

const METHOD_WORDS: Record<SplitMethod, string> = {
  equal: 'equally',
  exact: 'by exact amounts',
  percent: 'by percentages',
  shares: 'by shares',
};

/**
 * Add or edit a shared expense — Splitwise's sentence form:
 *
 *   With you and: [Goa trip ▾]
 *   [icon] Dinner at Thalassa        ₹ 4,800
 *   Paid by [you ▾] and split [equally ▾]
 *
 * Tapping either pill opens a sheet over the form (the draft never leaves
 * this screen). All arithmetic is in ./draft `evaluate`, the same function
 * that decides whether Save is enabled — so what is saved is exactly what the
 * footers showed.
 *
 * `categories` comes in as a prop: features may not import one another
 * (CLAUDE.md #9), so the route passes the ledger's categories down.
 */
export function ExpenseForm({ categories }: { categories: CategoryOption[] }) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const params = useLocalSearchParams<{ id?: string; groupId?: string; friendId?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const { data: hub } = useGroupsHub();

  const [selfId] = useState(getSelfId);
  const [existing] = useState(() => (editingId != null ? getExpenseForEdit(editingId) : undefined));

  const initialTarget = useMemo<Target | null>(() => {
    const groupId = existing?.groupId ?? (params.groupId ? Number(params.groupId) : null);
    if (groupId != null) {
      const row = getGroupRow(groupId);
      if (row?.directPersonId != null) return { kind: 'friend', personId: row.directPersonId };
      return row ? { kind: 'group', groupId } : null;
    }
    if (params.friendId) return { kind: 'friend', personId: Number(params.friendId) };
    return null;
    // Resolved once, from the params the form opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [target, setTarget] = useState<Target | null>(initialTarget);
  const members = useMemo<Member[]>(() => membersFor(target, selfId), [target, selfId]);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);

  const [description, setDescription] = useState(existing?.description ?? '');
  const [date, setDate] = useState(existing?.date ?? today);
  const [categoryId, setCategoryId] = useState<number | null>(existing?.categoryId ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const [draft, setDraft] = useState<Draft>(() =>
    existing
      ? draftFromExpense(
          existing,
          membersFor(initialTarget, selfId).map((m) => m.id),
          selfId,
          paiseToDecimalString,
          formatPercent,
        )
      : emptyDraft(
          membersFor(initialTarget, selfId).map((m) => m.id),
          selfId,
        ),
  );
  const [sheet, setSheet] = useState<SheetName>(initialTarget == null ? 'target' : null);
  const saving = useRef(false);

  useEffect(() => {
    if (editingId != null && !existing) {
      toast.error('That expense no longer exists');
      router.back();
    }
  }, [editingId, existing, router]);

  const result = useMemo(() => evaluate(draft, memberIds), [draft, memberIds]);
  const nameOf = (id: number) => (id === selfId ? 'you' : (members.find((m) => m.id === id)?.name ?? 'someone'));

  const chooseTarget = (next: Target) => {
    setTarget(next);
    // New people: keep the amount, reset who paid and who it was for.
    setDraft((d) => ({
      ...emptyDraft(
        membersFor(next, selfId).map((m) => m.id),
        selfId,
      ),
      amount: d.amount,
    }));
    setSheet(null);
  };

  const category = categories.find((c) => c.id === categoryId);
  const icon = category?.icon ?? deterministicIcon(description || 'Expense');
  const tint = category ? categoryColor(category.color, category.name) : deterministicColor(description || 'Expense');

  const canSave = target != null && description.trim() !== '' && result.problem == null;

  const onSave = () => {
    if (saving.current || !target) return;
    if (!description.trim()) {
      toast.error('Add a description');
      return;
    }
    if (result.problem || !result.payers || !result.shares || result.amountPaise == null) {
      toast.error(result.problem ?? 'Check the amounts');
      return;
    }
    saving.current = true;
    let groupId: number;
    if (target.kind === 'group') groupId = target.groupId;
    else {
      const direct = directGroupFor(target.personId);
      if (!direct.ok) {
        saving.current = false;
        return;
      }
      groupId = direct.value;
    }
    const saved = saveSplitExpense(
      {
        groupId,
        description,
        amountPaise: result.amountPaise,
        date,
        categoryId,
        splitMethod: draft.method,
        note: note.trim() || null,
        payers: result.payers,
        shares: result.shares,
      },
      editingId ?? undefined,
    );
    if (!saved.ok) {
      saving.current = false;
      return;
    }
    toast.success(editingId != null ? 'Expense updated' : `${description.trim()} added`);
    router.back();
  };

  const onDelete = () => {
    if (editingId == null || saving.current) return;
    if (!removeExpense(editingId).ok) return;
    toastWithUndo(`${description.trim() || 'Expense'} deleted`, () => undoRemoveExpense(editingId));
    saving.current = true;
    router.back();
  };

  const targetLabel =
    target == null
      ? 'Choose a group or friend'
      : target.kind === 'group'
        ? (hub.groupsById.get(target.groupId)?.name ?? getGroupRow(target.groupId)?.name ?? 'Group')
        : (members.find((m) => m.id === target.personId)?.name ?? 'Friend');

  const paidLabel =
    draft.paidMode === 'multiple' ? `${result.payers?.length ?? 'several'} people` : nameOf(draft.payerId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior="padding" className="flex-1" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between px-5 py-3">
          <RoundButton label="Close" onPress={() => router.back()}>
            <X size={19} color={colors.foreground} />
          </RoundButton>
          <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 16 }}>
            {editingId != null ? 'Edit expense' : 'Add expense'}
          </Text>
          {editingId != null ? (
            <RoundButton label="Delete expense" onPress={onDelete} tint={colors.expense}>
              <Trash2 size={17} color={colors.expense} />
            </RoundButton>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        <ScrollView className="px-5" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {/* With you and: [target] */}
          <Animated.View entering={FadeInDown.duration(300)} className="flex-row flex-wrap items-center gap-2">
            <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 14 }}>With you and:</Text>
            <Pill label={targetLabel} onPress={() => setSheet('target')} disabled={editingId != null} />
          </Animated.View>

          {/* Description + amount */}
          <Animated.View entering={FadeInDown.delay(50).duration(300)} className="mt-6 flex-row items-center gap-3">
            <CategoryIcon icon={icon} color={tint} size={52} />
            <TextInput
              autoFocus={editingId == null && target != null}
              value={description}
              onChangeText={setDescription}
              placeholder="Enter a description"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.primary}
              className="flex-1 border-b py-2.5"
              style={{
                color: colors.foreground,
                fontFamily: fonts.semibold,
                fontSize: 18,
                borderColor: colors.borderStrong,
              }}
            />
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(100).duration(300)} className="mt-3 flex-row items-center gap-3">
            <View style={{ width: 52 }} className="items-center">
              <Text style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: 30 }}>₹</Text>
            </View>
            <TextInput
              value={draft.amount}
              onChangeText={(amount) => setDraft((d) => ({ ...d, amount }))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.primary}
              className="flex-1 border-b py-1"
              style={{
                color: colors.foreground,
                fontFamily: fonts.bold,
                fontSize: 38,
                letterSpacing: -1,
                borderColor: colors.borderStrong,
                fontVariant: ['tabular-nums'],
              }}
            />
          </Animated.View>

          {/* Paid by [x] and split [y] */}
          {target != null ? (
            <Animated.View entering={FadeInDown.delay(150).duration(300)} className="mt-7 items-center">
              <View className="flex-row flex-wrap items-center justify-center gap-2">
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 15 }}>Paid by</Text>
                <Pill label={paidLabel} onPress={() => setSheet('paid')} />
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 15 }}>and split</Text>
                <Pill label={METHOD_WORDS[draft.method]} onPress={() => setSheet('split')} />
              </View>
              <SplitSummary result={result} draft={draft} members={members} selfId={selfId} />
            </Animated.View>
          ) : null}

          {/* Date, category, note */}
          <Animated.View entering={FadeInDown.delay(200).duration(300)} className="mt-8">
            <SectionLabel>Date</SectionLabel>
            <View className="flex-row items-center gap-2">
              {[
                { label: 'Today', value: today },
                { label: 'Yesterday', value: addDays(today, -1) },
              ].map((d) => (
                <Chip key={d.label} label={d.label} on={date === d.value} onPress={() => setDate(d.value)} />
              ))}
              <View className="flex-1 flex-row items-center justify-end gap-1">
                <RoundButton label="Previous day" onPress={() => setDate(addDays(date, -1))}>
                  <ChevronLeft size={17} color={colors.foreground} />
                </RoundButton>
                <View className="flex-row items-center gap-1.5 px-1">
                  <CalendarDays size={14} color={colors.primary} />
                  <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 13 }}>
                    {formatDayMonth(date)}
                  </Text>
                </View>
                <RoundButton label="Next day" onPress={() => setDate(addDays(date, 1))}>
                  <ChevronRight size={17} color={colors.foreground} />
                </RoundButton>
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(250).duration(300)} className="mt-6">
            <SectionLabel>Category (for group totals)</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {categories.map((c) => {
                const on = c.id === categoryId;
                const t = categoryColor(c.color, c.name) ?? colors.muted;
                return (
                  <PressableScale
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setCategoryId(on ? null : c.id)}
                    scaleTo={0.94}
                    className="flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
                    style={{
                      borderColor: on ? t : colors.border,
                      backgroundColor: on ? withAlpha(t, 0.16) : colors.card,
                    }}
                  >
                    <CategoryIcon icon={c.icon} color={t} size={24} />
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
            </ScrollView>
          </Animated.View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.primary}
            multiline
            className="mt-6 rounded-2xl border px-4 py-3.5"
            style={{
              color: colors.foreground,
              fontFamily: fonts.medium,
              fontSize: 14,
              backgroundColor: colors.card,
              borderColor: colors.border,
              minHeight: 52,
            }}
          />
        </ScrollView>

        <View
          className="px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
        >
          {!canSave && target != null && draft.amount.trim() !== '' && result.problem ? (
            <Text
              style={{
                color: colors.expense,
                fontFamily: fonts.medium,
                fontSize: 12,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              {result.problem}
            </Text>
          ) : null}
          <PressableScale
            accessibilityRole="button"
            onPress={onSave}
            className="items-center rounded-full py-4"
            style={{ backgroundColor: colors.primary, opacity: canSave ? 1 : 0.45 }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>
              {editingId != null ? 'Save changes' : 'Save expense'}
            </Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>

      <TargetSheet
        visible={sheet === 'target'}
        hub={hub}
        current={target}
        onPick={chooseTarget}
        onClose={() => (target ? setSheet(null) : router.back())}
      />
      <PaidSheet
        visible={sheet === 'paid'}
        draft={draft}
        setDraft={setDraft}
        members={members}
        result={result}
        onClose={() => setSheet(null)}
      />
      <SplitSheet
        visible={sheet === 'split'}
        draft={draft}
        setDraft={setDraft}
        members={members}
        result={result}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

/** Group members, or you + the friend for a 1:1 expense (the hidden group is created on save). */
function membersFor(target: Target | null, selfId: number): Member[] {
  if (!target) return [];
  if (target.kind === 'group') return getMembers(target.groupId);
  const friend = getFriends().find((f) => f.id === target.personId);
  return [
    { id: selfId, name: 'You', isSelf: true },
    ...(friend ? [{ id: friend.id, name: friend.name, isSelf: false }] : []),
  ];
}

function Pill({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.94}
      className="flex-row items-center gap-1 rounded-full border px-3.5 py-1.5"
      style={{ borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft }}
    >
      <Text
        numberOfLines={1}
        style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 15, maxWidth: 200 }}
      >
        {label}
      </Text>
      {!disabled ? <ChevronDown size={14} color={colors.primary} strokeWidth={2.6} /> : null}
    </PressableScale>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      className="rounded-full border px-3.5 py-1.5"
      style={{
        borderColor: on ? colors.primaryBorder : colors.border,
        backgroundColor: on ? colors.primarySoft : colors.card,
      }}
    >
      <Text style={{ color: on ? colors.primary : colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>{label}</Text>
    </PressableScale>
  );
}

/** One line under the sentence confirming what the split works out to. */
function SplitSummary({
  result,
  draft,
  members,
  selfId,
}: {
  result: ReturnType<typeof evaluate>;
  draft: Draft;
  members: Member[];
  selfId: number;
}) {
  const colors = useColors();
  if (result.amountPaise == null) return null;
  if (result.problem) {
    return (
      <Text style={{ color: colors.warning, fontFamily: fonts.medium, fontSize: 12, marginTop: 8 }}>
        {result.problem}
      </Text>
    );
  }
  let text: string;
  if (draft.method === 'equal' && result.shares) {
    const n = result.shares.length;
    text = `${formatINR(result.perPersonPaise ?? 0)}/person · ${n} ${n === 1 ? 'person' : 'people'}`;
  } else {
    text = (result.shares ?? [])
      .map(
        (s) =>
          `${s.personId === selfId ? 'you' : (members.find((m) => m.id === s.personId)?.name ?? '?')} ${formatINR(s.paise, { whole: s.paise % 100 === 0 })}`,
      )
      .join(' · ');
  }
  return (
    <Text
      numberOfLines={2}
      style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 8, textAlign: 'center' }}
    >
      {text}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function TargetSheet({
  visible,
  hub,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  hub: ReturnType<typeof useGroupsHub>['data'];
  current: Target | null;
  onPick: (t: Target) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  return (
    <FormSheet visible={visible} title="Split with" onClose={onClose}>
      {hub.groups.length === 0 && hub.friends.length === 0 ? (
        <View className="items-center py-6">
          <Users size={28} color={colors.muted} />
          <Text
            style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 14, marginTop: 8, textAlign: 'center' }}
          >
            Create a group or add a friend first.
          </Text>
          <PressableScale
            accessibilityRole="button"
            onPress={() => router.replace('/(modals)/group')}
            className="mt-4 rounded-full px-5 py-3"
            style={{ backgroundColor: colors.primary }}
          >
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.semibold }}>Create a group</Text>
          </PressableScale>
        </View>
      ) : null}
      {hub.groups.length > 0 ? <SectionLabel>Groups</SectionLabel> : null}
      {hub.groups.map((g) => {
        const on = current?.kind === 'group' && current.groupId === g.id;
        return (
          <OptionRow
            key={`g${g.id}`}
            on={on}
            onPress={() => onPick({ kind: 'group', groupId: g.id })}
            leading={
              <CategoryIcon icon={g.icon ?? deterministicIcon(g.name)} color={deterministicColor(g.name)} size={38} />
            }
            title={g.name}
            subtitle={`${g.memberCount} people`}
          />
        );
      })}
      {hub.friends.length > 0 ? (
        <View className="mt-4">
          <SectionLabel>Friends</SectionLabel>
        </View>
      ) : null}
      {hub.friends.map(({ person }) => {
        const on = current?.kind === 'friend' && current.personId === person.id;
        return (
          <OptionRow
            key={`f${person.id}`}
            on={on}
            onPress={() => onPick({ kind: 'friend', personId: person.id })}
            leading={<Avatar name={person.name} size={38} />}
            title={person.name}
            subtitle="Just the two of you"
          />
        );
      })}
    </FormSheet>
  );
}

function OptionRow({
  on,
  onPress,
  leading,
  title,
  subtitle,
}: {
  on: boolean;
  onPress: () => void;
  leading: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      scaleTo={0.98}
      className="mb-1.5 flex-row items-center gap-3 rounded-2xl px-3 py-2.5"
      style={{ backgroundColor: on ? colors.primarySoft : colors.card }}
    >
      {leading}
      <View className="flex-1">
        <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>{subtitle}</Text>
        ) : null}
      </View>
      {on ? <Check size={18} color={colors.primary} strokeWidth={2.6} /> : null}
    </PressableScale>
  );
}

function RemainingFooter({
  remaining,
  kind,
  total,
}: {
  remaining: number;
  kind: 'paise' | 'bp';
  total: number | null;
}) {
  const colors = useColors();
  if (total == null) return null;
  const ok = remaining === 0;
  const value = kind === 'paise' ? formatINR(Math.abs(remaining)) : `${formatPercent(Math.abs(remaining))}%`;
  const whole = kind === 'paise' ? formatINR(total) : '100%';
  return (
    <View
      className="items-center rounded-2xl py-3"
      style={{ backgroundColor: ok ? withAlpha(colors.income, 0.12) : withAlpha(colors.expense, 0.1) }}
    >
      <Text style={{ color: ok ? colors.income : colors.expense, fontFamily: fonts.semibold, fontSize: 14 }}>
        {ok ? `${whole} ✓` : remaining > 0 ? `${value} left of ${whole}` : `${value} over ${whole}`}
      </Text>
    </View>
  );
}

function PaidSheet({
  visible,
  draft,
  setDraft,
  members,
  result,
  onClose,
}: {
  visible: boolean;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  members: Member[];
  result: ReturnType<typeof evaluate>;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <FormSheet
      visible={visible}
      title="Who paid?"
      onClose={onClose}
      footer={
        draft.paidMode === 'multiple' ? (
          <RemainingFooter remaining={result.paidRemaining} kind="paise" total={result.amountPaise} />
        ) : undefined
      }
    >
      {members.map((m) => (
        <OptionRow
          key={m.id}
          on={draft.paidMode === 'single' && draft.payerId === m.id}
          onPress={() => {
            setDraft((d) => ({ ...d, paidMode: 'single', payerId: m.id }));
            onClose();
          }}
          leading={<Avatar name={m.name} isSelf={m.isSelf} size={36} />}
          title={m.isSelf ? 'You' : m.name}
        />
      ))}
      {members.length > 1 ? (
        <OptionRow
          on={draft.paidMode === 'multiple'}
          onPress={() => setDraft((d) => ({ ...d, paidMode: 'multiple' }))}
          leading={
            <View
              className="items-center justify-center rounded-full"
              style={{ width: 36, height: 36, backgroundColor: colors.elevated }}
            >
              <Users size={17} color={colors.foreground} />
            </View>
          }
          title="Multiple people"
          subtitle="Enter how much each person paid"
        />
      ) : null}
      {draft.paidMode === 'multiple' ? (
        <View className="mt-3 gap-2">
          {members.map((m) => (
            <AmountRow
              key={m.id}
              member={m}
              value={draft.paid[m.id] ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, paid: { ...d.paid, [m.id]: v } }))}
              prefix="₹"
            />
          ))}
        </View>
      ) : null}
    </FormSheet>
  );
}

function SplitSheet({
  visible,
  draft,
  setDraft,
  members,
  result,
  onClose,
}: {
  visible: boolean;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  members: Member[];
  result: ReturnType<typeof evaluate>;
  onClose: () => void;
}) {
  const colors = useColors();
  const shareOf = useCallback(
    (id: number) => result.shares?.find((s) => s.personId === id)?.paise ?? 0,
    [result.shares],
  );

  const footer =
    draft.method === 'exact' ? (
      <RemainingFooter remaining={result.splitRemaining} kind="paise" total={result.amountPaise} />
    ) : draft.method === 'percent' ? (
      <RemainingFooter remaining={result.splitRemaining} kind="bp" total={result.amountPaise} />
    ) : draft.method === 'equal' && result.perPersonPaise != null ? (
      <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' }}>
        {formatINR(result.perPersonPaise)}/person · {result.shares?.length ?? 0} people
      </Text>
    ) : undefined;

  return (
    <FormSheet visible={visible} title="Split" onClose={onClose} footer={footer}>
      <Segmented<SplitMethod>
        size="sm"
        value={draft.method}
        onChange={(method) => setDraft((d) => ({ ...d, method }))}
        options={[
          { value: 'equal', label: '= Equal' },
          { value: 'exact', label: '₹ Exact' },
          { value: 'percent', label: '% Percent' },
          { value: 'shares', label: 'Shares' },
        ]}
      />
      {result.amountPaise == null ? (
        <Text
          style={{ color: colors.warning, fontFamily: fonts.medium, fontSize: 13, marginTop: 14, textAlign: 'center' }}
        >
          Enter the amount first
        </Text>
      ) : null}

      <View className="mt-4 gap-2">
        {members.map((m) => {
          if (draft.method === 'equal') {
            const on = !!draft.included[m.id];
            return (
              <PressableScale
                key={m.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setDraft((d) => ({ ...d, included: { ...d.included, [m.id]: !on } }))}
                scaleTo={0.98}
                className="flex-row items-center gap-3 rounded-2xl px-3 py-2.5"
                style={{ backgroundColor: colors.card }}
              >
                <Avatar name={m.name} isSelf={m.isSelf} size={36} />
                <Text className="flex-1" style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 15 }}>
                  {m.isSelf ? 'You' : m.name}
                </Text>
                <Text
                  style={{
                    color: on ? colors.foreground : colors.subtle,
                    fontFamily: fonts.semibold,
                    fontSize: 14,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {on ? formatINR(shareOf(m.id)) : '—'}
                </Text>
                <View
                  className="items-center justify-center rounded-lg"
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: on ? colors.primary : 'transparent',
                    borderWidth: on ? 0 : 1.5,
                    borderColor: colors.borderStrong,
                  }}
                >
                  {on ? <Check size={15} color={colors.onPrimary} strokeWidth={3} /> : null}
                </View>
              </PressableScale>
            );
          }
          if (draft.method === 'exact') {
            return (
              <AmountRow
                key={m.id}
                member={m}
                value={draft.exact[m.id] ?? ''}
                prefix="₹"
                onChange={(v) => setDraft((d) => ({ ...d, exact: { ...d.exact, [m.id]: v } }))}
              />
            );
          }
          if (draft.method === 'percent') {
            return (
              <AmountRow
                key={m.id}
                member={m}
                value={draft.percent[m.id] ?? ''}
                suffix="%"
                hint={shareOf(m.id) > 0 ? formatINR(shareOf(m.id)) : undefined}
                onChange={(v) => setDraft((d) => ({ ...d, percent: { ...d.percent, [m.id]: v } }))}
              />
            );
          }
          const units = Number(draft.shares[m.id] ?? '0') || 0;
          const set = (n: number) =>
            setDraft((d) => ({ ...d, shares: { ...d.shares, [m.id]: String(Math.max(0, Math.min(99, n))) } }));
          return (
            <View
              key={m.id}
              className="flex-row items-center gap-3 rounded-2xl px-3 py-2"
              style={{ backgroundColor: colors.card }}
            >
              <Avatar name={m.name} isSelf={m.isSelf} size={36} />
              <View className="flex-1">
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 15 }}>
                  {m.isSelf ? 'You' : m.name}
                </Text>
                <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>
                  {formatINR(shareOf(m.id))}
                </Text>
              </View>
              <RoundButton label={`Fewer shares for ${m.name}`} onPress={() => set(units - 1)}>
                <Minus size={16} color={colors.foreground} />
              </RoundButton>
              <Text
                style={{
                  color: colors.foreground,
                  fontFamily: fonts.bold,
                  fontSize: 17,
                  minWidth: 24,
                  textAlign: 'center',
                }}
              >
                {units}
              </Text>
              <RoundButton label={`More shares for ${m.name}`} onPress={() => set(units + 1)}>
                <Plus size={16} color={colors.foreground} />
              </RoundButton>
            </View>
          );
        })}
      </View>
    </FormSheet>
  );
}

function AmountRow({
  member,
  value,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  member: Member;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  const colors = useColors();
  const invalid =
    value.trim() !== '' && (suffix ? !/^\d{0,3}(\.\d{0,2})?%?$/.test(value.trim()) : parseAmountToPaise(value) == null);
  return (
    <View className="flex-row items-center gap-3 rounded-2xl px-3 py-2" style={{ backgroundColor: colors.card }}>
      <Avatar name={member.name} isSelf={member.isSelf} size={36} />
      <View className="flex-1">
        <Text style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 15 }}>
          {member.isSelf ? 'You' : member.name}
        </Text>
        {hint ? <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12 }}>{hint}</Text> : null}
      </View>
      <View
        className="flex-row items-center rounded-xl border px-3"
        style={{
          borderColor: invalid ? colors.expense : colors.border,
          backgroundColor: colors.background,
          minWidth: 110,
        }}
      >
        {prefix ? (
          <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 15 }}>{prefix}</Text>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.primary}
          accessibilityLabel={`${member.isSelf ? 'Your' : `${member.name}'s`} ${suffix ? 'percentage' : 'amount'}`}
          style={{
            flex: 1,
            color: colors.foreground,
            fontFamily: fonts.semibold,
            fontSize: 16,
            paddingVertical: 8,
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
          }}
        />
        {suffix ? (
          <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 15 }}>{suffix}</Text>
        ) : null}
      </View>
    </View>
  );
}
