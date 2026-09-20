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
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { accent, useColors, withAlpha, type AccentHue } from '@/lib/theme';
import { rise } from '@/lib/motion';
import { Text } from '@/components/ui/Text';

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

export function More() {
  const colors = useColors();
  const router = useRouter();

  return (
    <Screen title="More" subtitle="Everything else SpendWise can do">
      <View className="gap-6 px-5">
        <Animated.View entering={rise(40)}>
          <Card glow={colors.income} className="flex-row items-center gap-4 p-5">
            <View
              className="h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: colors.incomeSoft }}
            >
              <ShieldCheck size={24} color={colors.income} />
            </View>
            <View className="flex-1">
              <Text weight="bold" size={16} tone="default">
                Private by design
              </Text>
              <Text weight="regular" size={13} tone="muted" style={{ marginTop: 2, lineHeight: 18 }}>
                Everything stays on this phone. SpendWise has no servers and sends nothing anywhere.
              </Text>
            </View>
          </Card>
        </Animated.View>

        {GROUPS.map((group, gi) => (
          <Animated.View key={group.title} entering={rise(110 + gi * 70)}>
            <Text variant="label" tone="muted" style={{ marginBottom: 10, marginLeft: 4 }}>
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
        <Text variant="bodyStrong" tone="default">
          {row.label}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 1 }}>
          {row.hint}
        </Text>
      </View>
      {disabled ? (
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: colors.elevated }}>
          <Text weight="semibold" size={10} tone="muted">
            SOON
          </Text>
        </View>
      ) : (
        <ChevronRight size={18} color={colors.subtle} />
      )}
    </PressableScale>
  );
}
