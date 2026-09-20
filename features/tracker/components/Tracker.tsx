import { useRouter } from 'expo-router';
import { ArrowDownWideNarrow, CalendarClock, Plus, Repeat } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { toast } from 'sonner-native';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PressableScale } from '@/components/ui/PressableScale';
import { Segmented } from '@/components/ui/Segmented';
import { formatDayMonth } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { renewalCountdown } from '@/lib/renewals';
import { useToday } from '@/lib/today';
import { useColors, withAlpha } from '@/lib/theme';
import { rise } from '@/lib/motion';
import { restoreSubscription, setSubscriptionStatus, softDeleteSubscription } from '../data/actions';
import { useSubscriptions } from '../data/hooks';
import {
  arrange,
  summarise,
  type EnrichedSubscription,
  type StatusFilter,
  type SubscriptionSort,
} from '../domain/renewal';
import { SubscriptionCard, type CardActions } from './SubscriptionCard';
import { Text } from '@/components/ui/Text';

/**
 * The Tracker: recurring costs and what renews next.
 *
 * Informational only — a subscription never creates a transaction (that is
 * the web app's rule too, and it keeps the ledger something the user typed).
 * Every figure here is computed on read, so nothing can go stale.
 */
export function Tracker() {
  const colors = useColors();
  const router = useRouter();
  const today = useToday();
  const { data: rows, status: queryStatus } = useSubscriptions(today);

  const [status, setStatus] = useState<StatusFilter>('active');
  const [sort, setSort] = useState<SubscriptionSort>('renewal');

  const summary = useMemo(() => summarise(rows), [rows]);
  const visible = useMemo(() => arrange(rows, status, sort), [rows, status, sort]);

  const openEditor = useCallback(
    (sub: EnrichedSubscription) => router.push({ pathname: '/(modals)/subscription', params: { id: String(sub.id) } }),
    [router],
  );

  const actions = useMemo<CardActions>(
    () => ({
      onEdit: openEditor,
      onPause: (s) => {
        if (setSubscriptionStatus(s.id, 'paused').ok) {
          toast.success(`${s.name} paused`, {
            action: { label: 'Undo', onClick: () => setSubscriptionStatus(s.id, 'active') },
          });
        }
      },
      onResume: (s) => {
        if (setSubscriptionStatus(s.id, 'active').ok) toast.success(`${s.name} resumed`);
      },
      onCancel: (s) => {
        if (setSubscriptionStatus(s.id, 'cancelled').ok) {
          toast.success(`${s.name} cancelled`, {
            action: { label: 'Undo', onClick: () => setSubscriptionStatus(s.id, 'active') },
          });
        }
      },
      onDelete: (s) => {
        if (softDeleteSubscription(s.id).ok) {
          toast.success(`${s.name} deleted`, {
            action: { label: 'Undo', onClick: () => restoreSubscription(s.id) },
          });
        }
      },
    }),
    [openEditor],
  );

  const empty = queryStatus === 'ok' && rows.length === 0;

  return (
    <Screen
      back
      title="Tracker"
      subtitle="Subscriptions and renewals"
      right={
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="New subscription"
          onPress={() => router.push('/(modals)/subscription')}
          scaleTo={0.9}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primary }}
        >
          <Plus size={21} color={colors.onPrimary} strokeWidth={2.6} />
        </PressableScale>
      }
    >
      {queryStatus === 'error' ? (
        <View className="px-5">
          <EmptyState
            icon={Repeat}
            title="Couldn't load your subscriptions"
            description="Something went wrong reading the database. Reopen the app and try again."
          />
        </View>
      ) : empty ? (
        <View className="px-5">
          <EmptyState
            icon={Repeat}
            title="Nothing to track yet"
            description="Add Netflix, rent or your gym and see every renewal counting down."
            action={{ label: 'Add a subscription', onPress: () => router.push('/(modals)/subscription') }}
          />
        </View>
      ) : rows.length > 0 ? (
        <View className="gap-3 px-5">
          <Animated.View entering={rise()}>
            <Card className="p-5" variant="accent">
              <Text variant="small" tone="muted">
                Every month
              </Text>
              <Text variant="amount" weight="bold" size={32} tone="default" style={{ letterSpacing: -1, marginTop: 2 }}>
                {formatINR(summary.monthlyTotalPaise, { whole: true })}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {formatINR(summary.yearlyTotalPaise, { whole: true })} a year · {summary.activeCount} active
              </Text>

              {summary.next ? (
                <View
                  className="mt-4 flex-row items-center gap-2.5 rounded-2xl p-3"
                  style={{ backgroundColor: withAlpha(colors.foreground, 0.05) }}
                >
                  <CalendarClock size={17} color={summary.next.urgency === 'soon' ? colors.warning : colors.primary} />
                  <Text variant="body" tone="default" className="flex-1">
                    {summary.next.name} renews {renewalCountdown(summary.next.daysUntilRenewal).toLowerCase()}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatDayMonth(summary.next.nextRenewal)}
                  </Text>
                </View>
              ) : null}
            </Card>
          </Animated.View>

          <Animated.View entering={rise(50)} className="gap-2">
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'cancelled', label: 'Cancelled' },
                { value: 'all', label: 'All' },
              ]}
            />
            <View className="flex-row items-center gap-2">
              <ArrowDownWideNarrow size={15} color={colors.subtle} />
              {(['renewal', 'amount', 'name'] as const).map((s) => {
                const on = sort === s;
                return (
                  <PressableScale
                    key={s}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setSort(s)}
                    className="rounded-full border px-3 py-1"
                    style={{
                      borderColor: on ? colors.primaryBorder : colors.border,
                      backgroundColor: on ? colors.primarySoft : 'transparent',
                    }}
                  >
                    <Text variant="small" tone={on ? 'primary' : 'muted'}>
                      {s === 'renewal' ? 'Renewal' : s === 'amount' ? 'Cost' : 'Name'}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </Animated.View>

          {visible.length === 0 ? (
            <Text weight="regular" size={13} tone="muted" className="py-8 text-center">
              Nothing {status === 'all' ? 'here' : status} right now.
            </Text>
          ) : (
            visible.map((s, i) => (
              <Animated.View key={s.id} entering={rise(Math.min(i, 6) * 40)}>
                <SubscriptionCard sub={s} actions={actions} />
              </Animated.View>
            ))
          )}
        </View>
      ) : null}
    </Screen>
  );
}
