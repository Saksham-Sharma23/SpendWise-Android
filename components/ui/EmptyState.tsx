import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { fonts, useColors } from '@/lib/theme';
import { PressableScale } from './PressableScale';

interface Action {
  label: string;
  onPress: () => void;
}

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: Action;
  secondary?: Action;
  /** A small pill under the text, e.g. "Coming in Phase 4". */
  badge?: string;
}

export function EmptyState({ icon: Icon, title, description, action, secondary, badge }: Props) {
  const colors = useColors();
  return (
    <Animated.View
      entering={FadeInDown.delay(80).duration(420)}
      className="items-center rounded-3xl border border-dashed px-6 py-10"
      style={{ borderColor: colors.borderStrong }}
    >
      <View
        className="mb-4 h-16 w-16 items-center justify-center rounded-2xl border"
        style={{ backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder }}
      >
        <Icon size={28} color={colors.primary} strokeWidth={1.8} />
      </View>
      <Text className="text-center text-lg" style={{ color: colors.foreground, fontFamily: fonts.semibold }}>
        {title}
      </Text>
      <Text
        className="mt-1.5 text-center text-sm"
        style={{ color: colors.muted, fontFamily: fonts.regular, lineHeight: 20 }}
      >
        {description}
      </Text>
      {badge ? (
        <View
          className="mt-4 rounded-full border px-3 py-1"
          style={{ borderColor: colors.border, backgroundColor: colors.elevated }}
        >
          <Text className="text-xs" style={{ color: colors.muted, fontFamily: fonts.medium }}>
            {badge}
          </Text>
        </View>
      ) : null}
      {action ? (
        <PressableScale
          accessibilityRole="button"
          onPress={action.onPress}
          className="mt-5 rounded-full px-5 py-3"
          style={{ backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.semibold }}>{action.label}</Text>
        </PressableScale>
      ) : null}
      {secondary ? (
        <PressableScale accessibilityRole="button" onPress={secondary.onPress} className="mt-2 px-4 py-2">
          <Text style={{ color: colors.primary, fontFamily: fonts.medium }}>{secondary.label}</Text>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}
