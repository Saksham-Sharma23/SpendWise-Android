import {
  ChartPie,
  PiggyBank,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { Insight, InsightIcon, InsightTone } from '@/lib/insight';
import { colors, fonts, useColors, withAlpha } from '@/lib/theme';
import { appear } from '@/lib/motion';
import { Card } from './Card';

const ICONS: Record<InsightIcon, LucideIcon> = {
  sparkles: Sparkles,
  'trending-down': TrendingDown,
  'trending-up': TrendingUp,
  alert: TriangleAlert,
  'piggy-bank': PiggyBank,
  'pie-chart': ChartPie,
};

const TONE: Record<InsightTone, string> = {
  good: colors.income,
  warn: colors.warning,
  neutral: colors.primary,
};

/**
 * One sentence about this month, from `buildInsight` (lib/insight.ts).
 * Re-keyed on the title so a new insight cross-fades in rather than the old
 * text changing in place.
 */
export function InsightBanner({ insight }: { insight: Insight }) {
  const colors = useColors();
  const tint = TONE[insight.tone];
  const Icon = ICONS[insight.icon];

  return (
    <Card glow={tint} className="flex-row items-center gap-3.5 p-4">
      <View
        className="h-11 w-11 items-center justify-center rounded-2xl"
        style={{ backgroundColor: withAlpha(tint, 0.14) }}
      >
        <Icon size={20} color={tint} strokeWidth={2.2} />
      </View>
      <Animated.View key={insight.title} entering={appear()} className="flex-1">
        <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>{insight.title}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 2 }}>
          {insight.body}
        </Text>
      </Animated.View>
    </Card>
  );
}
