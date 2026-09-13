import { useRouter } from 'expo-router';
import {
  ChevronRight,
  DatabaseBackup,
  FileSpreadsheet,
  FlaskConical,
  PiggyBank,
  Repeat,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '../../components/layout/Screen';
import { Card } from '../../components/ui/Card';
import { PressableScale } from '../../components/ui/PressableScale';
import { colors, fonts, withAlpha } from '../../lib/theme';

type Row = {
  icon: LucideIcon;
  tint: string;
  label: string;
  hint: string;
  href?: string;
  soon?: boolean;
};

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Money',
    rows: [
      { icon: PiggyBank, tint: '#D4F55E', label: 'Budgets', hint: 'Per-category limits and cycles', href: '/budgets' },
      { icon: Repeat, tint: '#9B8CFF', label: 'Tracker', hint: 'Subscriptions and renewals', href: '/tracker' },
      { icon: Users, tint: '#5EC8F5', label: 'Groups', hint: 'Split expenses with friends', soon: true },
    ],
  },
  {
    title: 'Your data',
    rows: [
      { icon: FileSpreadsheet, tint: '#3DDC97', label: 'Import a sheet', hint: 'Bring in an Excel or CSV export', href: '/import/pick' },
      { icon: DatabaseBackup, tint: '#F5B544', label: 'Backup & restore', hint: 'Export your data, or restore it', href: '/backup' },
    ],
  },
  {
    title: 'App',
    rows: [
      { icon: Settings, tint: '#B0B3BC', label: 'Settings', hint: 'Notifications, security, data', href: '/settings' },
      // Stripped from release bundles by the __DEV__ guard.
      ...(__DEV__
        ? [{ icon: FlaskConical, tint: '#F87171', label: 'Dev harness', hint: 'Seed 50k rows and benchmark queries', href: '/dev' }]
        : []),
    ],
  },
];

export default function MoreScreen() {
  const router = useRouter();

  return (
    <Screen title="More" subtitle="Everything else SpendWise can do">
      <View className="gap-6 px-5">
        <Animated.View entering={FadeInDown.delay(40).duration(420)}>
          <Card glow={colors.income} className="flex-row items-center gap-4 p-5">
            <View
              className="h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: colors.incomeSoft }}
            >
              <ShieldCheck size={24} color={colors.income} />
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 16 }}>Private by design</Text>
              <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: 2, lineHeight: 18 }}>
                Everything stays on this phone. SpendWise has no servers and sends nothing anywhere.
              </Text>
            </View>
          </Card>
        </Animated.View>

        {GROUPS.map((group, gi) => (
          <Animated.View key={group.title} entering={FadeInDown.delay(110 + gi * 70).duration(420)}>
            <Text
              style={{
                color: colors.muted,
                fontFamily: fonts.semibold,
                fontSize: 12,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                marginBottom: 10,
                marginLeft: 4,
              }}
            >
              {group.title}
            </Text>
            <Card>
              {group.rows.map((row, i) => (
                <MoreRow
                  key={row.label}
                  row={row}
                  first={i === 0}
                  onPress={() => row.href && router.push(row.href as never)}
                />
              ))}
            </Card>
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

function MoreRow({ row, first, onPress }: { row: Row; first: boolean; onPress: () => void }) {
  const Icon = row.icon;
  const disabled = row.soon === true;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.98}
      className="flex-row items-center gap-3.5 px-4 py-3.5"
      style={first ? undefined : { borderTopWidth: 1, borderTopColor: colors.border }}
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: withAlpha(row.tint, 0.13) }}
      >
        <Icon size={20} color={row.tint} />
      </View>
      <View className="flex-1">
        <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>{row.label}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>{row.hint}</Text>
      </View>
      {disabled ? (
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: colors.elevated }}>
          <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 10 }}>SOON</Text>
        </View>
      ) : (
        <ChevronRight size={18} color={colors.subtle} />
      )}
    </PressableScale>
  );
}
