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
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '../../components/layout/Screen';
import { Card } from '../../components/ui/Card';
import { PressableScale } from '../../components/ui/PressableScale';
import { accent, fonts, useColors, withAlpha, type AccentHue } from '../../lib/theme';

type Row = {
  icon: LucideIcon;
  tint: AccentHue;
  label: string;
  hint: string;
  href?: string;
  soon?: boolean;
};

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Money',
    rows: [
      { icon: PiggyBank, tint: 'lime', label: 'Budgets', hint: 'Per-category limits and cycles', href: '/budgets' },
      { icon: Repeat, tint: 'violet', label: 'Tracker', hint: 'Subscriptions and renewals', href: '/tracker' },
      {
        icon: Tags,
        tint: 'orange',
        label: 'Categories',
        hint: 'Create, rename, recolour and merge',
        href: '/categories',
      },
      { icon: Users, tint: 'blue', label: 'Groups', hint: 'Split expenses with friends', href: '/groups' },
    ],
  },
  {
    title: 'Your data',
    rows: [
      {
        icon: FileSpreadsheet,
        tint: 'mint',
        label: 'Sheets',
        hint: 'Import a sheet and keep it as its own workspace',
        href: '/sheets',
      },
      {
        icon: DatabaseBackup,
        tint: 'amber',
        label: 'Backup & restore',
        hint: 'Export your data, or restore it',
        href: '/backup',
      },
    ],
  },
  {
    title: 'App',
    rows: [
      { icon: Settings, tint: 'grey', label: 'Settings', hint: 'Notifications, security, data', href: '/settings' },
      // Stripped from release bundles by the __DEV__ guard.
      ...(__DEV__
        ? ([
            {
              icon: FlaskConical,
              tint: 'red',
              label: 'Dev harness',
              hint: 'Seed 50k rows and benchmark queries',
              href: '/dev',
            },
          ] as Row[])
        : []),
    ],
  },
];

export default function MoreScreen() {
  const colors = useColors();
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
              <Text
                style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: 2, lineHeight: 18 }}
              >
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
  const colors = useColors();
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
        style={{ backgroundColor: withAlpha(accent(row.tint), 0.13) }}
      >
        <Icon size={20} color={accent(row.tint)} />
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
