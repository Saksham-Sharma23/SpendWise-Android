import { useRouter } from 'expo-router';
import { ChartPie, Handshake, Receipt, Scale, Settings2, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/layout/Screen';
import { AvatarStack } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { deterministicColor, deterministicIcon } from '@/lib/identity';
import { fonts, useColors } from '@/lib/theme';
import { useGroup, useGroupActivity } from '../queries';
import { friendStatus, yourStatus } from '../wording';
import { ActivityList } from './ActivityList';
import { ActionPill, FloatingAction, RoundButton, toneColor } from './kit';

const PAGE = 60;

/**
 * One group: where you stand, who is in it, the three things you do next
 * (settle up, see balances, see totals) and everything that happened.
 */
export function GroupDetail({ groupId }: { groupId: number }) {
  const colors = useColors();
  const router = useRouter();
  const { data, status } = useGroup(groupId);
  const [limit, setLimit] = useState(PAGE);
  const activity = useGroupActivity(groupId, data.selfId, limit);

  const group = data.group;

  // A 1:1 friendship is shown as the friend, never as a "group".
  useEffect(() => {
    if (group?.directPersonId != null) {
      router.replace({ pathname: '/friends/[id]', params: { id: String(group.directPersonId) } });
    }
  }, [group?.directPersonId, router]);

  if (status === 'pending')
    return (
      <Screen back title="">
        {null}
      </Screen>
    );
  if (!group) {
    return (
      <Screen back title="Group">
        <View className="px-5">
          <EmptyState
            icon={Users}
            title="This group is gone"
            description="It may have been deleted. Undo from the toast, or go back to your groups."
          />
        </View>
      </Screen>
    );
  }

  const you = yourStatus(data.view.netPaise);
  const nameOf = (id: number) => data.people.get(id)?.name ?? 'Someone';
  const lines = [
    ...data.view.owedToYou.map((o) => friendStatus(nameOf(o.personId), o.paise)),
    ...data.view.youOwe.map((o) => friendStatus(nameOf(o.personId), -o.paise)),
  ];
  const settled = (data.balances?.edges.length ?? 0) === 0;
  const empty = activity.status === 'ok' && activity.data.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        back
        title={group.name}
        subtitle={`${group.memberCount} ${group.memberCount === 1 ? 'person' : 'people'}${group.simplifyDebts ? ' · debts simplified' : ''}`}
        right={
          <RoundButton
            label="Edit group"
            onPress={() => router.push({ pathname: '/(modals)/group', params: { id: String(groupId) } })}
          >
            <Settings2 size={19} color={colors.foreground} />
          </RoundButton>
        }
      >
        <View className="gap-4 px-5" style={{ paddingBottom: 90 }}>
          <Animated.View entering={FadeInDown.duration(340)}>
            <Card variant="accent" className="p-5">
              <View className="flex-row items-center gap-3">
                <CategoryIcon
                  icon={group.icon ?? deterministicIcon(group.name)}
                  color={deterministicColor(group.name)}
                  size={48}
                />
                <View className="flex-1">
                  <Text
                    style={{
                      color: toneColor(you.tone, colors),
                      fontFamily: fonts.bold,
                      fontSize: 20,
                      letterSpacing: -0.4,
                    }}
                  >
                    {you.text.charAt(0).toUpperCase() + you.text.slice(1)}
                  </Text>
                  {settled && !empty ? (
                    <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
                      Everyone is square
                    </Text>
                  ) : null}
                </View>
                <AvatarStack people={data.members} />
              </View>
              {lines.length > 0 ? (
                <View className="mt-3 gap-1">
                  {lines.slice(0, 3).map((l, i) => (
                    <Text key={i} style={{ color: toneColor(l.tone, colors), fontFamily: fonts.medium, fontSize: 13 }}>
                      {l.text}
                    </Text>
                  ))}
                  {lines.length > 3 ? (
                    <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12 }}>
                      and {lines.length - 3} more in Balances
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(340)}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <ActionPill
                icon={Handshake}
                label="Settle up"
                primary={!settled}
                onPress={() => router.push({ pathname: '/(modals)/settle-up', params: { groupId: String(groupId) } })}
              />
              <ActionPill
                icon={Scale}
                label="Balances"
                onPress={() => router.push({ pathname: '/(modals)/balances', params: { groupId: String(groupId) } })}
              />
              <ActionPill
                icon={ChartPie}
                label="Totals"
                onPress={() => router.push({ pathname: '/groups/[id]/totals', params: { id: String(groupId) } })}
              />
            </ScrollView>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(340)}>
            {empty ? (
              <EmptyState
                icon={Receipt}
                title="No expenses yet"
                description="Add the first one — who paid, and who it was for. Balances update as you go."
                action={{
                  label: 'Add an expense',
                  onPress: () =>
                    router.push({ pathname: '/(modals)/split-expense', params: { groupId: String(groupId) } }),
                }}
              />
            ) : (
              <ActivityList
                rows={activity.data}
                people={data.people}
                selfId={data.selfId}
                hasMore={activity.data.length >= limit}
                onShowMore={() => setLimit((l) => l + PAGE)}
              />
            )}
          </Animated.View>
        </View>
      </Screen>

      {!empty ? (
        <FloatingAction
          icon={Receipt}
          label="Add expense"
          onPress={() => router.push({ pathname: '/(modals)/split-expense', params: { groupId: String(groupId) } })}
        />
      ) : null}
    </View>
  );
}
