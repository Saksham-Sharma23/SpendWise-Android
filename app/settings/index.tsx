import { Appearance } from '@/features/settings';
import { useRouter } from 'expo-router';
import { Bell, ChevronRight, Fingerprint, Info, Trash2 } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { RETENTION_DAYS } from '@/db/retention';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { fonts, useColors, withAlpha } from '@/lib/theme';

function SectionLabel({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      style={{
        color: colors.muted,
        fontFamily: fonts.semibold,
        fontSize: 12,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <Screen back title="Settings" subtitle="Appearance, notifications, security">
      <View className="gap-6 px-5">
        <Animated.View entering={FadeInDown.duration(320)}>
          <Appearance />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(30).duration(320)} className="gap-3">
          <SectionLabel>Your data</SectionLabel>
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
                <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14 }}>
                  Recently deleted
                </Text>
                <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>
                  Restore a deleted transaction within {RETENTION_DAYS} days
                </Text>
              </View>
              <ChevronRight size={18} color={colors.subtle} />
            </PressableScale>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(320)} className="gap-3">
          <Text
            style={{
              color: colors.muted,
              fontFamily: fonts.semibold,
              fontSize: 12,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
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

        <Animated.View entering={FadeInDown.delay(120).duration(320)}>
          <View
            className="flex-row items-center gap-3 rounded-2xl border p-4"
            style={{ backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }}
          >
            <Info size={18} color={colors.primary} />
            <Text
              className="flex-1"
              style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 }}
            >
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
        <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14 }}>{label}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>{hint}</Text>
      </View>
      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.elevated }}>
        <Text style={{ color: colors.subtle, fontFamily: fonts.medium, fontSize: 10 }}>{phase}</Text>
      </View>
    </View>
  );
}
