import { CalendarClock } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { formatDayMonth } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { renewalCountdown, type UpcomingRenewal } from '../../lib/renewals';
import { colors, fonts, withAlpha } from '../../lib/theme';
import { Card } from './Card';
import { CategoryIcon } from './CategoryIcon';
import { PressableScale } from './PressableScale';

interface Props {
  renewals: UpcomingRenewal[];
  /** Opens the Tracker — the card is the one-tap route there (CLAUDE.md, navigation). */
  onOpenTracker: () => void;
}

/**
 * Upcoming renewals on Home. Items come from `upcomingRenewals`
 * (lib/renewals.ts); this component only draws them.
 */
export function RenewalsCard({ renewals, onOpenTracker }: Props) {
  return (
    <Card className="px-5 pb-2 pt-5">
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 17 }}>Upcoming renewals</Text>
        {renewals.length > 0 ? (
          <PressableScale accessibilityRole="button" onPress={onOpenTracker} className="py-1 pl-3">
            <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 13 }}>Tracker</Text>
          </PressableScale>
        ) : null}
      </View>

      {renewals.length === 0 ? (
        <PressableScale
          accessibilityRole="button"
          onPress={onOpenTracker}
          scaleTo={0.98}
          className="my-3 flex-row items-center gap-3 rounded-2xl p-3"
          style={{ backgroundColor: colors.elevated }}
        >
          <View
            className="h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: withAlpha('#9B8CFF', 0.14) }}
          >
            <CalendarClock size={19} color="#9B8CFF" />
          </View>
          <View className="flex-1">
            <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14 }}>No subscriptions yet</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>
              Track Netflix, rent or the gym and see what renews next
            </Text>
          </View>
        </PressableScale>
      ) : (
        <View className="mt-2">
          {renewals.map((r, i) => {
            const soon = r.urgency === 'soon';
            return (
              <View
                key={r.id}
                className="flex-row items-center gap-3 py-3"
                style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
              >
                <CategoryIcon icon={r.categoryIcon ?? 'repeat'} color={r.categoryColor ?? '#9B8CFF'} size={40} />
                <View className="flex-1 pr-2">
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
                    {r.name}
                  </Text>
                  <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
                    {formatDayMonth(r.nextDate)} · {r.billingCycle}
                  </Text>
                </View>
                <View className="items-end">
                  <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                    {formatINR(r.amountPaise, { whole: true })}
                  </Text>
                  <View
                    className="mt-1 rounded-full px-2 py-0.5"
                    style={{ backgroundColor: withAlpha(soon ? colors.warning : colors.muted, 0.14) }}
                  >
                    <Text style={{ color: soon ? colors.warning : colors.muted, fontFamily: fonts.semibold, fontSize: 10 }}>
                      {renewalCountdown(r.daysUntil)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}
