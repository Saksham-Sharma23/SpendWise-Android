import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { moveDatabaseAside, shareDatabaseCopy, type BootOutcome } from '../../../db/boot';
import { colors, fonts } from '../../../lib/theme';

/**
 * What the user sees when the database cannot be opened, migrated or seeded.
 *
 * There is no server to fix this from, so the screen offers real exits
 * instead of an apology: share a copy of the data (always first — nothing is
 * lost by it), try again, or start fresh. "Start fresh" moves the database
 * aside rather than deleting it, and needs a typed confirmation.
 */

const CONFIRM_WORD = 'START FRESH';

type Failure = Exclude<BootOutcome, { kind: 'ready' }>;

const TITLES: Record<Failure['kind'], string> = {
  unreadable: "SpendWise can't open your data",
  'migration-failed': "SpendWise couldn't finish updating your data",
  failed: 'SpendWise could not start',
};

export function BootFailure({ outcome, onRetry }: { outcome: Failure; onRetry: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const snapshot = outcome.kind === 'migration-failed' ? outcome.snapshot : null;

  async function run(label: string, fn: () => Promise<void> | void) {
    setBusy(label);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={() => void SplashScreen.hideAsync()}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 22 }}>{TITLES[outcome.kind]}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 }}>{outcome.message}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginBottom: 8 }}>
          Nothing has been deleted. Save a copy first, then try again.
          {snapshot ? ' A copy of your data from just before the update is also kept on this phone.' : ''}
        </Text>

        {snapshot ? (
          <Action
            label="Share the copy from before the update"
            busy={busy === 'snapshot'}
            onPress={() => run('snapshot', () => shareDatabaseCopy(snapshot))}
            primary
          />
        ) : null}
        <Action
          label="Share a copy of my data"
          busy={busy === 'share'}
          onPress={() => run('share', () => shareDatabaseCopy())}
          primary={!snapshot}
        />
        <Action label="Try again" busy={false} onPress={onRetry} />

        {confirming ? (
          <View style={{ gap: 8, marginTop: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.expense }}>
            <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 14 }}>Start with an empty app?</Text>
            <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 }}>
              Your current data file is moved aside, not deleted, but SpendWise will open empty. Type {CONFIRM_WORD} to confirm.
            </Text>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={CONFIRM_WORD}
              placeholderTextColor={colors.subtle}
              style={{
                color: colors.foreground,
                fontFamily: fonts.semibold,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            />
            <Action
              label="Move my data aside and start fresh"
              busy={busy === 'fresh'}
              disabled={typed.trim().toUpperCase() !== CONFIRM_WORD}
              danger
              onPress={() =>
                run('fresh', () => {
                  moveDatabaseAside();
                  onRetry();
                })
              }
            />
          </View>
        ) : (
          <Action label="Start fresh…" busy={false} onPress={() => setConfirming(true)} danger />
        )}

        {note ? <Text style={{ color: colors.expense, fontFamily: fonts.medium, fontSize: 13 }}>{note}</Text> : null}
      </ScrollView>
    </View>
  );
}

function Action({
  label,
  onPress,
  busy,
  primary = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const bg = primary ? colors.primary : colors.card;
  const fg = primary ? colors.onPrimary : danger ? colors.expense : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? colors.expense : colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: fonts.semibold, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}
