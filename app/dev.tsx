import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Screen } from '../components/layout/Screen';
import { databaseSizeBytes, countTransactions, runAnalyticsBenchmark } from '../db/benchmark';
import type { BenchResult } from '../db/benchmark';
import { devClearTransactions, devSeedTransactions } from '../db/devSeed';

/**
 * Development-only harness for the Phase 1 exit criterion.
 *
 * Reachable at /dev. Seeds 50,000 synthetic transactions, then times the
 * exact analytics queries Phase 5 will ship — on the real device, which is
 * the only measurement that counts.
 *
 * The pass mark: the 24-month trend query under ~50ms, and no query showing
 * a full table scan.
 */

const THRESHOLD_MS = 50;

function Button({
  label,
  onPress,
  busy,
  tone = 'default',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      className={`flex-row items-center justify-center gap-2 rounded-lg px-4 py-3 ${
        tone === 'danger' ? 'bg-destructive' : 'bg-primary'
      }`}
      style={{ opacity: busy ? 0.6 : 1 }}
    >
      {busy ? <ActivityIndicator size="small" color="#fff" /> : null}
      <Text
        className={tone === 'danger' ? 'text-destructive-foreground' : 'text-primary-foreground'}
        style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function DevScreen() {
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [results, setResults] = useState<BenchResult[] | null>(null);
  const [count, setCount] = useState(() => safeCount());

  function safeCount() {
    try {
      return countTransactions();
    } catch {
      return 0;
    }
  }

  function say(line: string) {
    setLog((l) => [line, ...l].slice(0, 12));
  }

  async function onSeed() {
    setBusy('seed');
    try {
      const r = await devSeedTransactions(50_000, 4);
      say(`Seeded ${r.inserted.toLocaleString()} rows in ${(r.ms / 1000).toFixed(1)}s`);
      say(`Range ${r.fromDate} → ${r.toDate}`);
      setCount(safeCount());
    } catch (e) {
      say(`Seed failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  function onBench() {
    setBusy('bench');
    try {
      const r = runAnalyticsBenchmark();
      setResults(r);
      const worst = Math.max(...r.map((x) => x.ms));
      const scans = r.filter((x) => x.scan).length;
      say(`Benchmark done — slowest ${worst}ms, ${scans} scan(s)`);
    } catch (e) {
      say(`Benchmark failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onClear() {
    setBusy('clear');
    try {
      const n = await devClearTransactions();
      say(`Cleared ${n.toLocaleString()} rows`);
      setResults(null);
      setCount(safeCount());
    } catch (e) {
      say(`Clear failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const sizeMb = (() => {
    try {
      return (databaseSizeBytes() / 1_048_576).toFixed(1);
    } catch {
      return '?';
    }
  })();

  const trend = results?.find((r) => r.name.startsWith('trend'));
  const passed = trend ? trend.ms <= THRESHOLD_MS && !trend.scan : null;

  return (
    <Screen title="Dev harness" subtitle="Phase 1 exit criterion" scroll={false}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="gap-3 px-5">
          <View className="rounded-lg border border-border bg-card p-4">
            <Text className="text-xs uppercase tracking-wider text-muted-foreground">
              Database
            </Text>
            <Text
              className="mt-1 text-2xl text-card-foreground"
              style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
            >
              {count.toLocaleString()} rows
            </Text>
            <Text className="text-xs text-muted-foreground">{sizeMb} MB on disk</Text>
          </View>

          <Button label="Seed 50,000 transactions" onPress={onSeed} busy={busy === 'seed'} />
          <Button label="Run analytics benchmark" onPress={onBench} busy={busy === 'bench'} />
          <Button
            label="Clear all transactions"
            onPress={onClear}
            busy={busy === 'clear'}
            tone="danger"
          />

          {passed !== null ? (
            <View
              className="rounded-lg border p-4"
              style={{
                borderColor: passed ? '#0B5C4B' : '#8E2436',
                backgroundColor: passed ? '#DCECE5' : '#F7E4E7',
              }}
            >
              <Text
                style={{
                  fontFamily: 'PlusJakartaSans_600SemiBold',
                  color: passed ? '#0B5C4B' : '#8E2436',
                }}
              >
                {passed ? 'Exit criterion PASSED' : 'Exit criterion FAILED'}
              </Text>
              <Text className="mt-1 text-xs" style={{ color: passed ? '#0B5C4B' : '#8E2436' }}>
                Trend query {trend?.ms}ms (target ≤{THRESHOLD_MS}ms)
                {trend?.scan ? ' · full table scan detected' : ' · index used'}
              </Text>
            </View>
          ) : null}

          {results ? (
            <View className="overflow-hidden rounded-lg border border-border bg-card">
              {results.map((r, i) => (
                <View key={r.name} className={i > 0 ? 'border-t border-border p-3' : 'p-3'}>
                  <View className="flex-row items-baseline justify-between">
                    <Text className="flex-1 text-sm text-card-foreground">{r.name}</Text>
                    <Text
                      className="text-sm"
                      style={{
                        fontVariant: ['tabular-nums'],
                        color: r.ms <= THRESHOLD_MS ? '#0B5C4B' : '#8A5410',
                        fontFamily: 'PlusJakartaSans_600SemiBold',
                      }}
                    >
                      {r.ms}ms
                    </Text>
                  </View>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    {r.rows} row{r.rows === 1 ? '' : 's'}
                    {r.scan ? ' · SCAN' : ' · indexed'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {log.length > 0 ? (
            <View className="rounded-lg border border-border bg-muted p-3">
              {log.map((line, i) => (
                <Text key={i} className="text-xs text-muted-foreground">
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
