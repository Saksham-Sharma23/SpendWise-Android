import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeftRight, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { Avatar } from '../../../components/ui/Avatar';
import { PressableScale } from '../../../components/ui/PressableScale';
import { addDays, formatDayMonth } from '../../../lib/dates';
import { formatINR, paiseToDecimalString, parseAmountToPaise } from '../../../lib/money';
import { useToday } from '../../../lib/today';
import { fonts, useColors } from '../../../lib/theme';
import { planFriendSettlement } from '../balances';
import { settle, settleMany } from '../mutations';
import { useGroup, useGroupsHub } from '../queries';
import { RoundButton, SectionLabel } from './kit';

/**
 * Record a payment. Two ways in:
 *   - from a group (optionally a specific suggested payment): one settlement;
 *   - from a friend: their whole balance with you, spread across every group
 *     you share (balances.planFriendSettlement), recorded all-or-nothing.
 * The amount starts at what is owed and can be lowered for a partial payment.
 */
export function SettleUpForm() {
  const params = useLocalSearchParams<{
    groupId?: string;
    friendId?: string;
    from?: string;
    to?: string;
    amount?: string;
  }>();
  return params.friendId ? <FriendSettle personId={Number(params.friendId)} /> : <GroupSettle params={params} />;
}

function GroupSettle({ params }: { params: { groupId?: string; from?: string; to?: string; amount?: string } }) {
  const router = useRouter();
  const groupId = Number(params.groupId);
  const { data, status } = useGroup(groupId);
  const today = useToday();

  // Default: the first payment involving you, else the group's first suggestion.
  const suggestion = useMemo(() => {
    if (params.from && params.to)
      return { from: Number(params.from), to: Number(params.to), paise: Number(params.amount ?? 0) };
    const edges = data.balances?.edges ?? [];
    return edges.find((e) => e.from === data.selfId || e.to === data.selfId) ?? edges[0] ?? null;
  }, [params.from, params.to, params.amount, data.balances, data.selfId]);

  if (status === 'pending') return null;
  if (!data.group) return null;

  const nameOf = (id: number) => (id === data.selfId ? 'You' : (data.people.get(id)?.name ?? 'Someone'));

  return (
    <SettleShell
      title={data.group.name}
      initialFrom={suggestion?.from ?? data.selfId}
      initialTo={suggestion?.to ?? data.members.find((m) => !m.isSelf)?.id ?? data.selfId}
      initialPaise={suggestion?.paise ?? 0}
      today={today}
      nameOf={nameOf}
      selfId={data.selfId}
      people={data.members.map((m) => m.id)}
      owedBetween={(from, to) => data.balances?.edges.find((e) => e.from === from && e.to === to)?.paise ?? 0}
      onSave={(from, to, paise, date, note) => {
        const result = settle({ groupId, from, to, amountPaise: paise, date, note });
        if (!result.ok) return false;
        toast.success(`Recorded: ${nameOf(from)} paid ${nameOf(to).replace(/^You$/, 'you')} ${formatINR(paise)}`);
        router.back();
        return true;
      }}
    />
  );
}

function FriendSettle({ personId }: { personId: number }) {
  const router = useRouter();
  const { data: hub, status } = useGroupsHub();
  const today = useToday();
  if (status === 'pending') return null;

  const friend = hub.friends.find((f) => f.person.id === personId);
  const balance = friend?.balance;
  if (!friend || !balance || balance.netPaise === 0) {
    return (
      <SettleShell
        title={friend?.person.name ?? 'Friend'}
        emptyMessage={`You and ${friend?.person.name ?? 'this friend'} are all settled up.`}
        initialFrom={hub.selfId}
        initialTo={personId}
        initialPaise={0}
        today={today}
        nameOf={() => ''}
        selfId={hub.selfId}
        people={[]}
        owedBetween={() => 0}
        onSave={() => false}
      />
    );
  }

  const name = friend.person.name;
  const theyOwe = balance.netPaise > 0;
  const total = Math.abs(balance.netPaise);
  const nameOf = (id: number) => (id === hub.selfId ? 'You' : name);

  return (
    <SettleShell
      title={name}
      fixedDirection
      initialFrom={theyOwe ? personId : hub.selfId}
      initialTo={theyOwe ? hub.selfId : personId}
      initialPaise={total}
      today={today}
      nameOf={nameOf}
      selfId={hub.selfId}
      people={[hub.selfId, personId]}
      owedBetween={() => total}
      footnote={
        balance.perGroup.length > 1 ? `Spread across ${balance.perGroup.length} groups, oldest first.` : undefined
      }
      onSave={(_from, _to, paise, date) => {
        const plan = planFriendSettlement(balance, hub.selfId, paise, paise >= total);
        const result = settleMany(plan, date);
        if (!result.ok) return false;
        toast.success(
          theyOwe ? `Recorded: ${name} paid you ${formatINR(paise)}` : `Recorded: you paid ${name} ${formatINR(paise)}`,
        );
        router.back();
        return true;
      }}
    />
  );
}

function SettleShell({
  title,
  initialFrom,
  initialTo,
  initialPaise,
  today,
  nameOf,
  selfId,
  people,
  owedBetween,
  onSave,
  fixedDirection = false,
  footnote,
  emptyMessage,
}: {
  title: string;
  initialFrom: number;
  initialTo: number;
  initialPaise: number;
  today: string;
  nameOf: (id: number) => string;
  selfId: number;
  people: number[];
  owedBetween: (from: number, to: number) => number;
  onSave: (from: number, to: number, paise: number, date: string, note: string | null) => boolean;
  fixedDirection?: boolean;
  footnote?: string;
  emptyMessage?: string;
}) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [amount, setAmount] = useState(initialPaise > 0 ? paiseToDecimalString(initialPaise) : '');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const saving = useRef(false);

  const paise = parseAmountToPaise(amount) ?? 0;
  const owed = owedBetween(from, to);
  const over = fixedDirection && paise > owed;

  const cycle = (current: number, other: number) => {
    const options = people.filter((id) => id !== other);
    if (options.length === 0) return current;
    return options[(options.indexOf(current) + 1) % options.length] ?? current;
  };

  const save = () => {
    if (saving.current || paise <= 0 || over || emptyMessage) return;
    saving.current = true;
    if (!onSave(from, to, paise, date, note.trim() || null)) saving.current = false;
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
        <Text
          numberOfLines={1}
          style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 16, flexShrink: 1 }}
        >
          Settle up · {title}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {emptyMessage ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 15, textAlign: 'center' }}>
            {emptyMessage}
          </Text>
        </View>
      ) : (
        <ScrollView className="px-5" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          <View className="mt-6 flex-row items-center justify-center gap-4">
            <Person
              name={nameOf(from)}
              isSelf={from === selfId}
              onPress={fixedDirection ? undefined : () => setFrom(cycle(from, to))}
            />
            <View className="items-center">
              <ArrowRight size={26} color={colors.primary} strokeWidth={2.4} />
              {!fixedDirection ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Swap who paid"
                  onPress={() => {
                    setFrom(to);
                    setTo(from);
                  }}
                  scaleTo={0.9}
                  className="mt-2 rounded-full p-2"
                  style={{ backgroundColor: colors.card }}
                >
                  <ArrowLeftRight size={15} color={colors.muted} />
                </PressableScale>
              ) : null}
            </View>
            <Person
              name={nameOf(to)}
              isSelf={to === selfId}
              onPress={fixedDirection ? undefined : () => setTo(cycle(to, from))}
            />
          </View>
          <Text
            style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 14, marginTop: 14, textAlign: 'center' }}
          >
            {nameOf(from)} {from === selfId ? 'pay' : 'pays'} {to === selfId ? 'you' : nameOf(to)}
          </Text>

          <View className="mt-6 flex-row items-center justify-center">
            <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 34, marginRight: 4 }}>₹</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.primary}
              style={{
                color: colors.foreground,
                fontFamily: fonts.bold,
                fontSize: 46,
                letterSpacing: -1.5,
                minWidth: 60,
                paddingVertical: 0,
                fontVariant: ['tabular-nums'],
              }}
            />
          </View>
          <Text
            style={{
              color: over ? colors.expense : colors.subtle,
              fontFamily: fonts.regular,
              fontSize: 12,
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            {over
              ? `That's more than the ${formatINR(owed)} owed`
              : owed > 0
                ? paise > 0 && paise < owed
                  ? `Partial payment · ${formatINR(owed - paise)} will still be owed`
                  : `${formatINR(owed)} owed`
                : 'No balance between these two — this records a payment anyway'}
          </Text>
          {footnote ? (
            <Text
              style={{
                color: colors.subtle,
                fontFamily: fonts.regular,
                fontSize: 12,
                textAlign: 'center',
                marginTop: 2,
              }}
            >
              {footnote}
            </Text>
          ) : null}

          <View className="mt-8">
            <SectionLabel>Date</SectionLabel>
            <View
              className="flex-row items-center rounded-2xl border p-1.5"
              style={{ backgroundColor: colors.card, borderColor: colors.border }}
            >
              <RoundButton label="Previous day" onPress={() => setDate(addDays(date, -1))}>
                <ChevronLeft size={18} color={colors.foreground} />
              </RoundButton>
              <View className="flex-1 flex-row items-center justify-center gap-2">
                <CalendarDays size={16} color={colors.primary} />
                <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
                  {date === today ? 'Today' : `${formatDayMonth(date)} ${date.slice(0, 4)}`}
                </Text>
              </View>
              <RoundButton label="Next day" onPress={() => setDate(addDays(date, 1))}>
                <ChevronRight size={18} color={colors.foreground} />
              </RoundButton>
            </View>
          </View>

          {!fixedDirection ? (
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional) — UPI, cash…"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.primary}
              className="mt-4 rounded-2xl border px-4 py-3.5"
              style={{
                color: colors.foreground,
                fontFamily: fonts.medium,
                fontSize: 14,
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            />
          ) : null}
        </ScrollView>
      )}

      <View
        className="px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
      >
        <PressableScale
          accessibilityRole="button"
          disabled={paise <= 0 || over || !!emptyMessage}
          onPress={save}
          className="items-center rounded-full py-4"
          style={{ backgroundColor: colors.primary, opacity: paise <= 0 || over || emptyMessage ? 0.45 : 1 }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>
            {paise > 0 ? `Record ${formatINR(paise)}` : 'Record payment'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function Person({ name, isSelf, onPress }: { name: string; isSelf: boolean; onPress?: () => void }) {
  const colors = useColors();
  const body = (
    <View className="items-center">
      <Avatar name={name} isSelf={isSelf} size={64} />
      <Text
        numberOfLines={1}
        style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 13, marginTop: 6, maxWidth: 96 }}
      >
        {name}
      </Text>
      {onPress ? (
        <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 10 }}>tap to change</Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${name}, tap to change`}
      onPress={onPress}
      scaleTo={0.94}
    >
      {body}
    </PressableScale>
  );
}
