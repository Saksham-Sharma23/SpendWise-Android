import { useRouter } from 'expo-router';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { useColors, withAlpha } from '@/lib/theme';
import { useGroup } from '../data/hooks';
import { memberStatus, simplifiedNote, transferLine } from '../domain/wording';
import { toneColor } from './kit';
import { Text } from '@/components/ui/Text';
import { FieldLabel } from '@/components/ui/Section';

/**
 * Who owes whom in a group — the heart of it. Each row is one payment that
 * settles balances, with a Settle button. When simplification saved
 * payments, it says how many, so the feature explains itself.
 */
export function BalancesSheet({ groupId }: { groupId: number }) {
  const colors = useColors();
  const router = useRouter();
  const { data, status } = useGroup(groupId);

  if (status === 'pending' || !data.group || !data.balances)
    return <View style={{ flex: 1, backgroundColor: colors.card }} />;

  const { balances, selfId } = data;
  const nameOf = (id: number) => (id === selfId ? 'You' : (data.people.get(id)?.name ?? 'Someone'));
  const note = data.group.simplifyDebts ? simplifiedNote(balances.edges.length, balances.pairwiseCount) : null;
  const members = [...data.members].sort((a, b) => (balances.nets.get(b.id) ?? 0) - (balances.nets.get(a.id) ?? 0));

  return (
    <ScrollView style={{ backgroundColor: colors.card }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text weight="bold" size={20} tone="default">
        Balances
      </Text>
      <Text weight="regular" size={13} tone="muted" style={{ marginTop: 2 }}>
        {data.group.name}
      </Text>

      {note ? (
        <View
          className="mt-4 flex-row items-center gap-2 rounded-2xl px-3.5 py-3"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <Sparkles size={16} color={colors.primary} />
          <Text variant="body" tone="default" className="flex-1">
            Simplified: {note}
          </Text>
        </View>
      ) : null}

      <View className="mt-5">
        <FieldLabel>Who owes whom</FieldLabel>
        {balances.edges.length === 0 ? (
          <View className="items-center rounded-2xl py-8" style={{ backgroundColor: colors.elevated }}>
            <Text weight="medium" size={14} tone="muted">
              Everyone is settled up 🎉
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {balances.edges.map((e) => {
              const line = transferLine(nameOf(e.from), nameOf(e.to), e.paise, e.from === selfId, e.to === selfId);
              return (
                <View
                  key={`${e.from}-${e.to}`}
                  className="flex-row items-center gap-3 rounded-2xl p-3"
                  style={{ backgroundColor: colors.elevated }}
                >
                  <View className="flex-row items-center gap-1">
                    <Avatar name={nameOf(e.from)} isSelf={e.from === selfId} size={32} />
                    <ArrowRight size={14} color={colors.subtle} />
                    <Avatar name={nameOf(e.to)} isSelf={e.to === selfId} size={32} />
                  </View>
                  {/* A payment between two other people is neutral information, not greyed out. */}
                  <Text
                    weight="medium"
                    size={14}
                    className="flex-1"
                    style={{ color: line.tone === 'none' ? colors.foreground : toneColor(line.tone, colors) }}
                  >
                    {line.text}
                  </Text>
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={`Settle: ${line.text}`}
                    onPress={() =>
                      router.push({
                        pathname: '/(modals)/settle-up',
                        params: {
                          groupId: String(groupId),
                          from: String(e.from),
                          to: String(e.to),
                          amount: String(e.paise),
                        },
                      })
                    }
                    scaleTo={0.92}
                    className="rounded-full px-3.5 py-2"
                    style={{ backgroundColor: withAlpha(colors.primary, 0.14) }}
                  >
                    <Text weight="semibold" size={12} tone="primary">
                      Settle
                    </Text>
                  </PressableScale>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View className="mt-6">
        <FieldLabel>Everyone's balance</FieldLabel>
        <View className="gap-1">
          {members.map((m) => {
            const net = balances.nets.get(m.id) ?? 0;
            const s = memberStatus(net, m.isSelf);
            const who = m.isSelf ? 'You' : m.name;
            return (
              <View key={m.id} className="flex-row items-center gap-3 py-2">
                <Avatar name={m.name} isSelf={m.isSelf} size={34} />
                <Text weight="medium" size={14} tone="default" className="flex-1">
                  {who}
                </Text>
                <Text weight="semibold" size={13} style={{ color: toneColor(s.tone, colors) }}>
                  {s.text}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
