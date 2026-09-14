import { CirclePause, CirclePlay, EllipsisVertical, Pencil, Trash2, XCircle } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { CategoryIcon } from '../../../components/ui/CategoryIcon';
import { PressableScale } from '../../../components/ui/PressableScale';
import { formatDayMonth } from '../../../lib/dates';
import { formatINR } from '../../../lib/money';
import { renewalCountdown } from '../../../lib/renewals';
import { colors, fonts, useColors, withAlpha } from '../../../lib/theme';
import type { EnrichedSubscription } from '../renewal';

export interface CardActions {
  onEdit: (sub: EnrichedSubscription) => void;
  onPause: (sub: EnrichedSubscription) => void;
  onResume: (sub: EnrichedSubscription) => void;
  onCancel: (sub: EnrichedSubscription) => void;
  onDelete: (sub: EnrichedSubscription) => void;
}

/**
 * One subscription.
 *
 * Everything shown is derived, never stored: the renewal date, the countdown
 * and the /month figure all come from `enrich` (../renewal.ts).
 *
 * Pause · Resume · Cancel · Delete live behind a kebab, as on the web. The
 * first three are status changes, which is why the sheet below is one list of
 * choices rather than three different-looking buttons.
 */
export const SubscriptionCard = memo(function SubscriptionCard({
  sub,
  actions,
}: {
  sub: EnrichedSubscription;
  actions: CardActions;
}) {
  const [menu, setMenu] = useState(false);
  const dim = sub.status !== 'active';
  const soon = sub.urgency === 'soon';

  const countdown =
    sub.status === 'cancelled' ? 'Cancelled' : sub.status === 'paused' ? 'Paused' : renewalCountdown(sub.daysUntilRenewal);

  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${sub.name}, ${countdown}`}
        onPress={() => actions.onEdit(sub)}
        onLongPress={() => setMenu(true)}
        scaleTo={0.98}
        className="overflow-hidden rounded-3xl border"
        style={{ backgroundColor: colors.card, borderColor: colors.border, opacity: dim ? 0.62 : 1 }}
      >
        <View className="flex-row items-center gap-3 p-4">
          <CategoryIcon icon={sub.icon} color={sub.color} size={44} />

          <View className="flex-1">
            <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
              {sub.name}
            </Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
              {sub.status === 'active' ? `Renews ${formatDayMonth(sub.nextRenewal)}` : sub.billingCycle}
              {sub.status === 'active' && sub.billingCycle !== 'monthly'
                ? ` · ${formatINR(sub.monthlyCostPaise, { whole: true })}/mo`
                : ''}
            </Text>
          </View>

          <View className="items-end gap-1">
            <Text
              style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 15, fontVariant: ['tabular-nums'] }}
            >
              {formatINR(sub.amountPaise, { whole: true })}
            </Text>
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: withAlpha(soon ? colors.warning : colors.muted, 0.14) }}
            >
              <Text style={{ color: soon ? colors.warning : colors.muted, fontFamily: fonts.semibold, fontSize: 10 }}>
                {countdown}
              </Text>
            </View>
          </View>

          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${sub.name}`}
            onPress={() => setMenu(true)}
            scaleTo={0.86}
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.elevated }}
          >
            <EllipsisVertical size={17} color={colors.muted} />
          </PressableScale>
        </View>
      </PressableScale>

      <ActionSheet
        visible={menu}
        sub={sub}
        onClose={() => setMenu(false)}
        actions={actions}
      />
    </>
  );
});

/**
 * The kebab menu. A plain Modal rather than a library sheet: it holds four
 * rows, and the app already carries enough animation machinery.
 */
function ActionSheet({
  visible,
  sub,
  onClose,
  actions,
}: {
  visible: boolean;
  sub: EnrichedSubscription;
  onClose: () => void;
  actions: CardActions;
}) {
  const colors = useColors();
  const run = (fn: (s: EnrichedSubscription) => void) => () => {
    onClose();
    fn(sub);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose}>
        <Animated.View entering={FadeInDown.duration(200)}>
          <Pressable
            className="rounded-t-3xl border-t p-3 pb-8"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
            // Swallow the press so tapping inside does not dismiss.
            onPress={() => {}}
          >
            <View className="mb-2 items-center py-2">
              <View className="h-1 w-10 rounded-full" style={{ backgroundColor: colors.borderStrong }} />
              <Text numberOfLines={1} className="mt-3" style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
                {sub.name}
              </Text>
            </View>

            <Row icon={<Pencil size={18} color={colors.foreground} />} label="Edit" onPress={run(actions.onEdit)} />
            {sub.status === 'active' ? (
              <Row
                icon={<CirclePause size={18} color={colors.foreground} />}
                label="Pause"
                hint="Stops counting towards your monthly total"
                onPress={run(actions.onPause)}
              />
            ) : (
              <Row
                icon={<CirclePlay size={18} color={colors.primary} />}
                label="Resume"
                onPress={run(actions.onResume)}
              />
            )}
            {sub.status !== 'cancelled' ? (
              <Row
                icon={<XCircle size={18} color={colors.warning} />}
                label="Cancel"
                hint="Keeps the record, stops the countdown"
                onPress={run(actions.onCancel)}
              />
            ) : null}
            <Row
              icon={<Trash2 size={18} color={colors.expense} />}
              label="Delete"
              tint={colors.expense}
              onPress={run(actions.onDelete)}
            />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  label,
  hint,
  tint,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  tint?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Animated.View entering={FadeIn.duration(160)}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        scaleTo={0.98}
        className="flex-row items-center gap-3 rounded-2xl px-4 py-3.5"
      >
        {icon}
        <View className="flex-1">
          <Text style={{ color: tint ?? colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>{label}</Text>
          {hint ? (
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 }}>{hint}</Text>
          ) : null}
        </View>
      </PressableScale>
    </Animated.View>
  );
}
