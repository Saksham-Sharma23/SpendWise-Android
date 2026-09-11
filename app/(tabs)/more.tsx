import { useRouter } from 'expo-router';
import {
  ChevronRight,
  DatabaseBackup,
  FileSpreadsheet,
  PiggyBank,
  Repeat,
  Settings,
  Users,
} from 'lucide-react-native';
import { Pressable, Text, View, useColorScheme } from 'react-native';

import { Screen } from '../../components/layout/Screen';

type Row = {
  icon: typeof PiggyBank;
  label: string;
  hint: string;
  href?: string;
  soon?: boolean;
};

const ROWS: Row[] = [
  { icon: PiggyBank, label: 'Budgets', hint: 'Per-category limits and cycles', href: '/budgets' },
  { icon: Repeat, label: 'Tracker', hint: 'Subscriptions and renewals', href: '/tracker' },
  {
    icon: FileSpreadsheet,
    label: 'Import a sheet',
    hint: 'Bring in an Excel or CSV export',
    href: '/import/pick',
  },
  {
    icon: DatabaseBackup,
    label: 'Backup & restore',
    hint: 'Export your data, or restore it',
    href: '/backup',
  },
  { icon: Settings, label: 'Settings', hint: 'Theme, notifications, data', href: '/settings' },
  { icon: Users, label: 'Groups', hint: 'Split expenses — coming in v1.1', soon: true },
];

export default function MoreScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? '#9DACA3' : '#525E57';
  const mutedIcon = scheme === 'dark' ? '#5A665F' : '#A8B2AC';

  return (
    <Screen title="More">
      <View className="px-5">
        <View className="overflow-hidden rounded-lg border border-border bg-card">
          {ROWS.map((row, i) => {
            const Icon = row.icon;
            const disabled = row.soon === true;
            return (
              <Pressable
                key={row.label}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => row.href && router.push(row.href as never)}
                className={`flex-row items-center gap-3 px-4 py-3.5 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
                style={{ opacity: disabled ? 0.45 : 1 }}
              >
                <Icon size={20} color={disabled ? mutedIcon : iconColor} />
                <View className="flex-1">
                  <Text
                    className="text-base text-card-foreground"
                    style={{ fontFamily: 'PlusJakartaSans_500Medium' }}
                  >
                    {row.label}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{row.hint}</Text>
                </View>
                {!disabled ? <ChevronRight size={18} color={mutedIcon} /> : null}
              </Pressable>
            );
          })}
        </View>

        <Text className="mt-4 px-1 text-xs text-muted-foreground">
          SpendWise stores everything on this device. Nothing is sent anywhere.
        </Text>
      </View>
    </Screen>
  );
}
