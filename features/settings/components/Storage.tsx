import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AlertTriangle, Database } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { describeSize, type QuotaState } from '@/db/backup';
import { formatCount } from '@/lib/money';
import { useColors, withAlpha } from '@/lib/theme';
import { storageState, type StorageSnapshot } from '../data/storage';

/**
 * How much room the database takes, against Android's auto-backup quota.
 *
 * The quota is **25 MB and it fails silently**: past it, auto-backup simply
 * stops, with no error, no notification and nothing the user could ever
 * discover — until a new phone restores an empty app. This card exists because
 * showing the number is the only possible defence against a limit that never
 * announces itself. (Measured on this project's own dev build: a 16 MB
 * database already exceeded it.)
 *
 * The room left is stated in TRANSACTIONS, not megabytes, because "about
 * 80,000 more entries" is something a person can act on and "10 MB free" is
 * not. The per-row size is measured from this database, so it accounts for
 * indexes and notes rather than assuming.
 */
export function Storage() {
  const colors = useColors();
  const [state, setState] = useState<StorageSnapshot | null>(null);

  useEffect(() => {
    setState(storageState());
  }, []);

  if (!state) return null;
  const { footprint, quota, room } = state;
  const tint = toneFor(quota, colors);

  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        Storage
      </Text>
      <Card className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <View
            className="h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: withAlpha(tint, 0.14) }}
          >
            {quota.level === 'ok' ? <Database size={18} color={tint} /> : <AlertTriangle size={18} color={tint} />}
          </View>
          <View className="flex-1">
            <Text weight="semibold" size={14} tone="default">
              {describeSize(footprint.databaseBytes)} of data
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 1 }}>
              {formatCount(footprint.transactions)} transaction{footprint.transactions === 1 ? '' : 's'}
              {footprint.backupsBytes > 0 ? ` · ${describeSize(footprint.backupsBytes)} in kept backups` : ''}
            </Text>
          </View>
        </View>

        {/* A bar, because a fraction is easier to feel than a pair of numbers. */}
        <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.elevated }}>
          <View
            style={{
              width: `${Math.max(2, Math.round(quota.fraction * 100))}%`,
              height: '100%',
              borderRadius: 999,
              backgroundColor: tint,
            }}
          />
        </View>

        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {message(quota, room)}
        </Text>
      </Card>
    </View>
  );
}

function toneFor(quota: QuotaState, colors: ReturnType<typeof useColors>): string {
  if (quota.level === 'over') return colors.expense;
  if (quota.level === 'warn') return colors.warning;
  return colors.primary;
}

/**
 * What the number means, in the order that matters: what is wrong (if
 * anything), then what to do about it.
 */
function message(quota: QuotaState, room: number | null): string {
  const limit = describeSize(quota.quota);
  if (quota.level === 'over') {
    return `Android stops backing the app up automatically past ${limit}, and it does so without any warning. Export a backup yourself — it is the only copy you can rely on now.`;
  }
  if (quota.level === 'warn') {
    return `Android's own automatic backup silently stops working past ${limit}. Keep exporting your own backups as this grows.`;
  }
  const headroom = room != null ? ` — room for roughly ${formatCount(room)} more` : '';
  return `Android backs the app up automatically up to ${limit}${headroom}. That backup is a convenience, not a guarantee: it is capped, it is silent when it fails, and it only arrives on a new phone. Your own exports are the reliable copy.`;
}
