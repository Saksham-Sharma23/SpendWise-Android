import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { isNull } from 'drizzle-orm';
import { Text, View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { db } from '../../db/client';
import { categories } from '../../db/schema';
import { formatINR, HAS_INDIAN_ICU } from '../../lib/money';
import { getCycleWindow, todayISO } from '../../lib/dates';

/**
 * Home — placeholder for Phase 3.
 *
 * For now it doubles as the Phase 1 verification surface: it reads live from
 * SQLite through useLiveQuery, so if categories render here then the whole
 * chain works — SQLCipher unlocked the file, migrations applied, the seed
 * ran, and the change listener is wired.
 */
export default function HomeScreen() {
  const { data: cats } = useLiveQuery(
    db.select().from(categories).where(isNull(categories.deletedAt)),
  );

  const cycle = getCycleWindow(1, todayISO());

  return (
    <Screen title="Home" subtitle="Phase 3 builds the real dashboard here">
      <View className="gap-3 px-5">
        <View className="rounded-lg border border-border bg-card p-4">
          <Text className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Database
          </Text>
          <Text className="text-base text-card-foreground">
            {cats.length} categories seeded
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            Read live from SQLite via useLiveQuery
          </Text>
        </View>

        <View className="rounded-lg border border-border bg-card p-4">
          <Text className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Currency formatting
          </Text>
          <Text
            className="text-2xl text-card-foreground"
            style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
          >
            {formatINR(12450000)}
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            {HAS_INDIAN_ICU
              ? 'Platform ICU active — lakh grouping native'
              : 'ICU unavailable — using manual lakh grouping'}
          </Text>
        </View>

        <View className="rounded-lg border border-border bg-card p-4">
          <Text className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Budget cycle (reset day 1)
          </Text>
          <Text className="text-base text-card-foreground">
            {cycle.start} → {cycle.end}
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">
            {cycle.daysLeft} of {cycle.daysTotal} days left
          </Text>
        </View>

        {cats.length > 0 ? (
          <View className="rounded-lg border border-border bg-card p-4">
            <Text className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Seeded categories
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {cats.map((c) => (
                <View
                  key={c.id}
                  className="rounded-md px-2 py-1"
                  style={{ backgroundColor: (c.color ?? '#8A8A8A') + '22' }}
                >
                  <Text className="text-xs" style={{ color: c.color ?? '#8A8A8A' }}>
                    {c.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
