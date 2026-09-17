import { useRouter } from 'expo-router';
import { ChevronRight, Plus, Receipt, UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '../../../components/layout/Screen';
import { Avatar } from '../../../components/ui/Avatar';
import { Card } from '../../../components/ui/Card';
import { CategoryIcon } from '../../../components/ui/CategoryIcon';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import { Swap } from '../../../components/ui/Swap';
import { deterministicColor, deterministicIcon } from '../../../lib/identity';
import { formatINR } from '../../../lib/money';
import { fonts, useColors } from '../../../lib/theme';
import { useGroupsHub, type Hub, type HubGroup } from '../queries';
import { friendShort, friendStatus, yourStatus } from '../wording';
import { FloatingAction, RoundButton, toneColor } from './kit';

type Tab = 'groups' | 'friends';

/**
 * The Groups hub: where you stand overall, then every group and every friend.
 * Splitwise's home, in one scroll: the number that matters first, the people
 * behind it next, and one obvious button to add an expense.
 */
export function GroupsHub() {
  const colors = useColors();
  const router = useRouter();
  const { data: hub, status } = useGroupsHub();
  const [tab, setTab] = useState<Tab>('groups');

  const net = hub.owedToYouPaise - hub.youOwePaise;
  const overall = yourStatus(net);
  const nothingYet = status === 'ok' && hub.groups.length === 0 && hub.friends.length === 0;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        back
        title="Groups"
        subtitle="Split expenses with friends"
        right={
          <RoundButton
            label={tab === 'groups' ? 'New group' : 'Add a friend'}
            filled
            onPress={() => router.push(tab === 'groups' ? '/(modals)/group' : '/(modals)/friend')}
          >
            {tab === 'groups' ? (
              <Plus size={21} color={colors.onPrimary} strokeWidth={2.6} />
            ) : (
              <UserPlus size={19} color={colors.onPrimary} strokeWidth={2.4} />
            )}
          </RoundButton>
        }
      >
        {status === 'pending' ? null : nothingYet ? (
          <View className="px-5">
            <EmptyState
              icon={Users}
              title="Split costs without the maths"
              description="Make a group for a trip or your flat, add who paid, and SpendWise works out the fewest payments to settle up."
              action={{ label: 'Create a group', onPress: () => router.push('/(modals)/group') }}
              secondary={{ label: 'Add a friend', onPress: () => router.push('/(modals)/friend') }}
            />
          </View>
        ) : (
          <View className="gap-4 px-5" style={{ paddingBottom: 90 }}>
            <Animated.View entering={FadeInDown.duration(360)}>
              <Card variant="accent" className="p-5">
                <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>Overall</Text>
                <Text
                  style={{
                    color: toneColor(overall.tone, colors),
                    fontFamily: fonts.bold,
                    fontSize: 26,
                    letterSpacing: -0.6,
                    marginTop: 4,
                  }}
                >
                  {overall.text.charAt(0).toUpperCase() + overall.text.slice(1)}
                </Text>
                <View className="mt-4 flex-row gap-3">
                  <Figure label="You are owed" paise={hub.owedToYouPaise} color={colors.income} />
                  <Figure label="You owe" paise={hub.youOwePaise} color={colors.expense} />
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(60).duration(360)}>
              <Segmented<Tab>
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'groups', label: `Groups · ${hub.groups.length}` },
                  { value: 'friends', label: `Friends · ${hub.friends.length}` },
                ]}
              />
            </Animated.View>

            {/* The list travels the way the pill just did, so the switch reads
                as one movement rather than a swap of contents. */}
            <Swap swapKey={tab} direction={tab === 'friends' ? 1 : -1}>
              {tab === 'groups' ? <GroupList hub={hub} /> : <FriendList hub={hub} />}
            </Swap>
          </View>
        )}
      </Screen>

      {status === 'ok' && !nothingYet ? (
        <FloatingAction icon={Receipt} label="Add expense" onPress={() => router.push('/(modals)/split-expense')} />
      ) : null}
    </View>
  );
}

function Figure({ label, paise, color }: { label: string; paise: number; color: string }) {
  const colors = useColors();
  return (
    <View className="flex-1 rounded-2xl px-3 py-2.5" style={{ backgroundColor: colors.elevated }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color, fontFamily: fonts.bold, fontSize: 17, marginTop: 2, fontVariant: ['tabular-nums'] }}
      >
        {formatINR(paise, { whole: true })}
      </Text>
    </View>
  );
}

function GroupList({ hub }: { hub: Hub }) {
  const colors = useColors();
  const router = useRouter();
  if (hub.groups.length === 0) {
    return (
      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/(modals)/group')}
        className="items-center rounded-3xl border border-dashed py-8"
        style={{ borderColor: colors.borderStrong }}
      >
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 14 }}>
          No groups yet — tap to create one
        </Text>
      </PressableScale>
    );
  }
  return (
    <Card>
      {hub.groups.map((g, i) => (
        <GroupRow key={g.id} group={g} hub={hub} first={i === 0} />
      ))}
    </Card>
  );
}

function GroupRow({ group, hub, first }: { group: HubGroup; hub: Hub; first: boolean }) {
  const colors = useColors();
  const router = useRouter();
  const status = yourStatus(group.view.netPaise);
  const nameOf = (id: number) => hub.people.get(id)?.name ?? 'Someone';
  // Up to two people behind your balance, like Splitwise's group list.
  const lines = [
    ...group.view.owedToYou.map((o) => friendStatus(nameOf(o.personId), o.paise)),
    ...group.view.youOwe.map((o) => friendStatus(nameOf(o.personId), -o.paise)),
  ].slice(0, 2);
  const icon = group.icon ?? deterministicIcon(group.name);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${status.text}`}
      onPress={() => router.push({ pathname: '/groups/[id]', params: { id: String(group.id) } })}
      scaleTo={0.98}
      className="flex-row items-center gap-3 px-4 py-3.5"
      style={first ? undefined : { borderTopWidth: 1, borderTopColor: colors.border }}
    >
      <CategoryIcon icon={icon} color={deterministicColor(group.name)} size={46} />
      <View className="flex-1">
        <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
          {group.name}
        </Text>
        <Text style={{ color: toneColor(status.tone, colors), fontFamily: fonts.medium, fontSize: 13, marginTop: 1 }}>
          {status.text}
        </Text>
        {lines.map((l, i) => (
          <Text
            key={i}
            numberOfLines={1}
            style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}
          >
            {l.text}
          </Text>
        ))}
      </View>
      <ChevronRight size={18} color={colors.subtle} />
    </PressableScale>
  );
}

function FriendList({ hub }: { hub: Hub }) {
  const colors = useColors();
  const router = useRouter();
  if (hub.friends.length === 0) {
    return (
      <PressableScale
        accessibilityRole="button"
        onPress={() => router.push('/(modals)/friend')}
        className="items-center rounded-3xl border border-dashed py-8"
        style={{ borderColor: colors.borderStrong }}
      >
        <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 14 }}>
          No friends yet — tap to add one
        </Text>
      </PressableScale>
    );
  }
  return (
    <Card>
      {hub.friends.map(({ person, balance }, i) => {
        const status = friendShort(balance?.netPaise ?? 0);
        const groupCount = balance?.perGroup.length ?? 0;
        return (
          <PressableScale
            key={person.id}
            accessibilityRole="button"
            accessibilityLabel={`${person.name}, ${status.text}`}
            onPress={() => router.push({ pathname: '/friends/[id]', params: { id: String(person.id) } })}
            scaleTo={0.98}
            className="flex-row items-center gap-3 px-4 py-3.5"
            style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <Avatar name={person.name} size={44} />
            <View className="flex-1">
              <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
                {person.name}
              </Text>
              <Text
                style={{ color: toneColor(status.tone, colors), fontFamily: fonts.medium, fontSize: 13, marginTop: 1 }}
              >
                {status.text}
              </Text>
              {groupCount > 1 ? (
                <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>
                  across {groupCount} groups
                </Text>
              ) : null}
            </View>
            <ChevronRight size={18} color={colors.subtle} />
          </PressableScale>
        );
      })}
    </Card>
  );
}
