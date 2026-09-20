import { useRouter } from 'expo-router';
import { ChevronRight, Handshake, Pencil, Receipt, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PressableScale } from '@/components/ui/PressableScale';
import { deterministicColor, deterministicIcon } from '@/lib/identity';
import { useColors } from '@/lib/theme';
import { rise } from '@/lib/motion';
import { useGroupActivity, useGroupsHub } from '../data/hooks';
import { friendShort, friendStatus } from '../domain/wording';
import { ActivityList } from './ActivityList';
import { ActionPill, toneColor } from './kit';
import { Text } from '@/components/ui/Text';
import { IconButton } from '@/components/ui/IconButton';
import { FieldLabel } from '@/components/ui/Section';

const PAGE = 60;

/**
 * A friend: what they owe you (or you owe them) across every group you share,
 * group by group, plus the expenses the two of you split outside any group.
 */
export function FriendDetail({ personId }: { personId: number }) {
  const colors = useColors();
  const router = useRouter();
  const { data: hub, status } = useGroupsHub();
  const [limit, setLimit] = useState(PAGE);

  const person = hub.people.get(personId);
  const entry = hub.friends.find((f) => f.person.id === personId);
  const direct = [...hub.groupsById.values()].find((g) => g.directPersonId === personId);
  const activity = useGroupActivity(direct?.id ?? -1, hub.selfId, limit);

  if (status === 'pending')
    return (
      <Screen back title="">
        {null}
      </Screen>
    );
  if (!person || person.deletedAt != null || !entry) {
    return (
      <Screen back title="Friend">
        <View className="px-5">
          <EmptyState
            icon={UserX}
            title="This friend is gone"
            description="They may have been removed. Undo from the toast, or go back."
          />
        </View>
      </Screen>
    );
  }

  const net = entry.balance?.netPaise ?? 0;
  const headline = friendStatus(person.name, net);
  const theirGroups = hub.groupsOf.get(personId) ?? new Set<number>();
  const shared = [...hub.groupsById.values()].filter((g) => g.directPersonId == null && theirGroups.has(g.id));
  const perGroup = new Map((entry.balance?.perGroup ?? []).map((g) => [g.groupId, g.paise]));
  const addExpense = () => router.push({ pathname: '/(modals)/split-expense', params: { friendId: String(personId) } });

  return (
    <Screen
      back
      title={person.name}
      subtitle={
        shared.length > 0 ? `In ${shared.length} ${shared.length === 1 ? 'group' : 'groups'} with you` : 'Friend'
      }
      right={
        <IconButton
          size="lg"
          label="Edit friend"
          onPress={() => router.push({ pathname: '/(modals)/friend', params: { id: String(personId) } })}
        >
          <Pencil size={17} color={colors.foreground} />
        </IconButton>
      }
    >
      <View className="gap-4 px-5" style={{ paddingBottom: 32 }}>
        <Animated.View entering={rise()}>
          <Card variant="accent" className="flex-row items-center gap-4 p-5">
            <Avatar name={person.name} size={56} />
            <View className="flex-1">
              <Text weight="bold" size={20} style={{ color: toneColor(headline.tone, colors), letterSpacing: -0.4 }}>
                {headline.tone === 'none'
                  ? 'All settled up'
                  : headline.text.charAt(0).toUpperCase() + headline.text.slice(1)}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                Across everything you share
              </Text>
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={rise(60)} className="flex-row gap-2">
          <ActionPill
            icon={Handshake}
            label="Settle up"
            primary={net !== 0}
            onPress={() => router.push({ pathname: '/(modals)/settle-up', params: { friendId: String(personId) } })}
          />
          <ActionPill icon={Receipt} label="Add expense" onPress={addExpense} />
        </Animated.View>

        {shared.length > 0 ? (
          <Animated.View entering={rise(120)}>
            <FieldLabel>Groups</FieldLabel>
            <Card>
              {shared.map((g, i) => {
                const line = friendShort(perGroup.get(g.id) ?? 0);
                return (
                  <PressableScale
                    key={g.id}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/groups/[id]', params: { id: String(g.id) } })}
                    scaleTo={0.98}
                    className="flex-row items-center gap-3 px-4 py-3"
                    style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: colors.border }}
                  >
                    <CategoryIcon
                      icon={g.icon ?? deterministicIcon(g.name)}
                      color={deterministicColor(g.name)}
                      size={38}
                    />
                    <View className="flex-1">
                      <Text weight="semibold" size={14} tone="default" numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text variant="small" style={{ color: toneColor(line.tone, colors), marginTop: 1 }}>
                        {line.text}
                      </Text>
                    </View>
                    <ChevronRight size={17} color={colors.subtle} />
                  </PressableScale>
                );
              })}
            </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={rise(180)}>
          <FieldLabel>Just the two of you</FieldLabel>
          {direct && activity.data.length > 0 ? (
            <ActivityList
              rows={activity.data}
              people={hub.people}
              selfId={hub.selfId}
              hasMore={activity.data.length >= limit}
              onShowMore={() => setLimit((l) => l + PAGE)}
            />
          ) : (
            <PressableScale
              accessibilityRole="button"
              onPress={addExpense}
              className="items-center rounded-3xl border border-dashed py-7"
              style={{ borderColor: colors.borderStrong }}
            >
              <Text weight="medium" size={14} tone="muted">
                Split something with {person.name} outside a group
              </Text>
            </PressableScale>
          )}
        </Animated.View>
      </View>
    </Screen>
  );
}
