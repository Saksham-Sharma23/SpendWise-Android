import { useRouter } from 'expo-router';
import { Bell, ChevronRight, Fingerprint, Info, Trash2 } from 'lucide-react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { useColors, withAlpha } from '@/lib/theme';
import { rise } from '@/lib/motion';
import { Appearance } from '../components/Appearance';
import { Storage } from '../components/Storage';
import { RETENTION_DAYS } from '../data/retention';
import { Text } from '@/components/ui/Text';

export function Settings() {
  const colors = useColors();
  const router = useRouter();

  return (
    <Screen back title="Settings" subtitle="Appearance, notifications, security">
      <View className="gap-6 px-5">
        <Animated.View entering={rise()}>
          <Appearance />
        </Animated.View>

        <Animated.View entering={rise(30)} className="gap-3">
          <Text variant="label" tone="muted">
            Your data
          </Text>
          <Card className="p-1">
            <PressableScale
              accessibilityRole="button"
              onPress={() => router.push('/settings/recently-deleted')}
              scaleTo={0.98}
              className="flex-row items-center gap-3 p-3"
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: withAlpha(colors.expense, 0.14) }}
              >
                <Trash2 size={18} color={colors.expense} />
              </View>
              <View className="flex-1">
                <Text weight="semibold" size={14} tone="default">
                  Recently deleted
                </Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 1 }}>
                  Restore a deleted transaction within {RETENTION_DAYS} days
                </Text>
              </View>
              <ChevronRight size={18} color={colors.subtle} />
            </PressableScale>
          </Card>
        </Animated.View>

        <Animated.View entering={rise(60)}>
          <Storage />
        </Animated.View>

        <Animated.View entering={rise(90)} className="gap-3">
          <Text variant="label" tone="muted">
            Coming later
          </Text>
          <Card className="p-1">
            <Soon
              icon={Bell}
              tint={colors.warning}
              label="Notifications"
              hint="Renewal reminders, budget alerts and a monthly backup nudge"
              phase="Phase 8"
            />
            <Soon
              icon={Fingerprint}
              tint={colors.income}
              label="App lock"
              hint="Require a fingerprint to open SpendWise"
              phase="Phase 9"
            />
          </Card>
        </Animated.View>

        <Animated.View entering={rise(150)}>
          <View
            className="flex-row items-center gap-3 rounded-2xl border p-4"
            style={{ backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }}
          >
            <Info size={18} color={colors.primary} />
            <Text variant="caption" tone="muted" className="flex-1" style={{ lineHeight: 18 }}>
              SpendWise has no servers and no internet permission. Everything here stays on this phone.
            </Text>
          </View>
        </Animated.View>
      </View>
    </Screen>
  );
}

function Soon({
  icon: Icon,
  tint,
  label,
  hint,
  phase,
}: {
  icon: typeof Bell;
  tint: string;
  label: string;
  hint: string;
  phase: string;
}) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-3 p-3">
      <View
        className="h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: withAlpha(tint, 0.14) }}
      >
        <Icon size={18} color={tint} />
      </View>
      <View className="flex-1">
        <Text weight="semibold" size={14} tone="default">
          {label}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 1 }}>
          {hint}
        </Text>
      </View>
      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.elevated }}>
        <Text weight="medium" size={10} tone="subtle">
          {phase}
        </Text>
      </View>
    </View>
  );
}
