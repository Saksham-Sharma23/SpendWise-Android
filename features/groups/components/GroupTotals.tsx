import { ChartPie } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Donut } from '@/components/charts/Donut';
import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { categoryColor } from '@/lib/categoryColor';
import { formatINR } from '@/lib/money';
import { fonts, useColors } from '@/lib/theme';
import { useGroup, useGroupStats } from '../queries';
import { SectionLabel } from './kit';

/**
 * A group's spending: the total, your share of it and what you actually
 * paid, where it went by category, and each member's share. Kept out of the
 * ledger entirely — this is the group's money, not your spending.
 */
export function GroupTotals({ groupId }: { groupId: number }) {
  const colors = useColors();
  const group = useGroup(groupId);
  const stats = useGroupStats(groupId, group.data.selfId);
  const [selected, setSelected] = useState<string | null>(null);

  const s = stats.data;
  const name = group.data.group?.name ?? 'Group';

  if (group.status === 'pending' || stats.status === 'pending')
    return (
      <Screen back title="Totals">
        {null}
      </Screen>
    );
  if (s.count === 0) {
    return (
      <Screen back title="Totals" subtitle={name}>
        <View className="px-5">
          <EmptyState
            icon={ChartPie}
            title="Nothing spent yet"
            description="Totals appear once the group has an expense."
          />
        </View>
      </Screen>
    );
  }

  const slices = s.categories.map((c) => ({
    key: c.id == null ? 'none' : String(c.id),
    value: c.totalPaise,
    color: c.id == null ? colors.muted : (categoryColor(c.color, c.name) ?? colors.muted),
  }));
  const picked = s.categories.find((c) => (c.id == null ? 'none' : String(c.id)) === selected);
  const people = group.data.people;
  const maxShare = Math.max(1, ...s.members.map((m) => m.owedPaise));

  return (
    <Screen back title="Totals" subtitle={name}>
      <View className="gap-4 px-5" style={{ paddingBottom: 32 }}>
        <Animated.View entering={FadeInDown.duration(340)}>
          <Card variant="accent" className="p-5">
            <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>Total group spending</Text>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.bold,
                fontSize: 32,
                letterSpacing: -1,
                marginTop: 2,
              }}
            >
              {formatINR(s.totalPaise, { whole: true })}
            </Text>
            <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12 }}>
              {s.count} {s.count === 1 ? 'expense' : 'expenses'}
            </Text>
            <View className="mt-4 flex-row gap-3">
              <Stat label="Your share" value={formatINR(s.yourSharePaise, { whole: true })} hint="what you consumed" />
              <Stat label="You paid" value={formatINR(s.youPaidPaise, { whole: true })} hint="out of your pocket" />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(340)}>
          <Card className="items-center p-5">
            <View className="w-full">
              <SectionLabel>By category</SectionLabel>
            </View>
            <Donut slices={slices} selectedKey={selected} onSelect={setSelected}>
              <View pointerEvents="none" className="items-center px-8">
                <Text numberOfLines={1} style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>
                  {picked ? (picked.name ?? 'Uncategorised') : 'Spent'}
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 21 }}
                >
                  {formatINR(picked ? picked.totalPaise : s.totalPaise, { whole: true })}
                </Text>
              </View>
            </Donut>
            <View className="mt-4 w-full gap-2">
              {s.categories.map((c) => {
                const key = c.id == null ? 'none' : String(c.id);
                const tint = c.id == null ? colors.muted : (categoryColor(c.color, c.name) ?? colors.muted);
                return (
                  <View
                    key={key}
                    className="flex-row items-center gap-3"
                    style={{ opacity: selected && selected !== key ? 0.5 : 1 }}
                  >
                    <CategoryIcon icon={c.icon} color={tint} size={30} />
                    <Text
                      numberOfLines={1}
                      className="flex-1"
                      style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 14 }}
                    >
                      {c.name ?? 'Uncategorised'}
                    </Text>
                    <Text
                      style={{
                        color: colors.foreground,
                        fontFamily: fonts.semibold,
                        fontSize: 14,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {formatINR(c.totalPaise, { whole: true })}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(340)}>
          <Card className="p-5">
            <SectionLabel>Each person’s share</SectionLabel>
            <View className="gap-3">
              {s.members.map((m) => {
                const person = people.get(m.personId);
                const isSelf = m.personId === group.data.selfId;
                return (
                  <View key={m.personId} className="flex-row items-center gap-3">
                    <Avatar name={person?.name ?? '?'} isSelf={isSelf} size={34} />
                    <View className="flex-1">
                      <View className="flex-row justify-between">
                        <Text style={{ color: colors.foreground, fontFamily: fonts.medium, fontSize: 14 }}>
                          {isSelf ? 'You' : (person?.name ?? 'Someone')}
                        </Text>
                        <Text
                          style={{
                            color: colors.foreground,
                            fontFamily: fonts.semibold,
                            fontSize: 14,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {formatINR(m.owedPaise, { whole: true })}
                        </Text>
                      </View>
                      <View
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                        style={{ backgroundColor: colors.elevated }}
                      >
                        <View
                          className="h-full rounded-full"
                          style={{
                            width: `${(m.owedPaise / maxShare) * 100}%`,
                            backgroundColor: isSelf ? colors.primary : colors.borderStrong,
                          }}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        </Animated.View>
      </View>
    </Screen>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  const colors = useColors();
  return (
    <View className="flex-1 rounded-2xl px-3 py-2.5" style={{ backgroundColor: colors.elevated }}>
      <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 17, marginTop: 2 }}
      >
        {value}
      </Text>
      <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 10, marginTop: 1 }}>{hint}</Text>
    </View>
  );
}
