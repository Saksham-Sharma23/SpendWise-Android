import { DatabaseBackup, FileSpreadsheet, Plus, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { fonts, useColors, withAlpha } from '../../lib/theme';
import { Card } from '../ui/Card';
import { PressableScale } from '../ui/PressableScale';

interface Props {
  onAdd: () => void;
  onImport: () => void;
  onRestore: () => void;
  onSkip: () => void;
}

/**
 * First run. A new install is genuinely blank — there is no account to sync
 * data down — so Home offers the three ways in (CLAUDE.md, navigation):
 * add a transaction, import a spreadsheet, restore a backup.
 */
export function Welcome({ onAdd, onImport, onRestore, onSkip }: Props) {
  const colors = useColors();
  return (
    <View className="gap-3 px-5">
      <Animated.View entering={FadeInDown.delay(40).duration(450)}>
        <Card variant="accent" className="p-6">
          <View
            className="h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <ShieldCheck size={28} color={colors.primary} />
          </View>
          <Text
            style={{
              color: colors.foreground,
              fontFamily: fonts.bold,
              fontSize: 24,
              letterSpacing: -0.5,
              marginTop: 16,
            }}
          >
            Welcome to SpendWise
          </Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 6 }}>
            Everything you add stays on this phone. No account, no servers — so let's give it something to show you.
          </Text>
        </Card>
      </Animated.View>

      <Door
        index={1}
        icon={Plus}
        tint={colors.primary}
        title="Add your first transaction"
        hint="Takes about five seconds"
        onPress={onAdd}
        primary
      />
      <Door
        index={2}
        icon={FileSpreadsheet}
        tint={colors.income}
        title="Import a spreadsheet"
        hint="Bring in an Excel or CSV file you already keep"
        onPress={onImport}
      />
      <Door
        index={3}
        icon={DatabaseBackup}
        tint={colors.warning}
        title="Restore a backup"
        hint="Moving from another phone"
        onPress={onRestore}
      />

      <Animated.View entering={FadeInDown.delay(320).duration(400)} className="items-center">
        <PressableScale accessibilityRole="button" onPress={onSkip} className="px-4 py-3">
          <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>Skip for now</Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

function Door({
  index,
  icon: Icon,
  tint,
  title,
  hint,
  onPress,
  primary = false,
}: {
  index: number;
  icon: LucideIcon;
  tint: string;
  title: string;
  hint: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const colors = useColors();
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 70).duration(420)}>
      <PressableScale
        accessibilityRole="button"
        onPress={onPress}
        className="flex-row items-center gap-4 rounded-3xl border p-4"
        style={{
          backgroundColor: primary ? colors.primary : colors.card,
          borderColor: primary ? colors.primary : colors.border,
        }}
      >
        <View
          className="h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: primary ? withAlpha(colors.onPrimary, 0.12) : withAlpha(tint, 0.14) }}
        >
          <Icon size={22} color={primary ? colors.onPrimary : tint} strokeWidth={2.3} />
        </View>
        <View className="flex-1">
          <Text style={{ color: primary ? colors.onPrimary : colors.foreground, fontFamily: fonts.bold, fontSize: 16 }}>
            {title}
          </Text>
          <Text
            style={{
              color: primary ? withAlpha(colors.onPrimary, 0.7) : colors.muted,
              fontFamily: fonts.regular,
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {hint}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}
