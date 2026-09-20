import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { Text, font } from '@/components/ui/Text';
import {
  applyRestore,
  discardRestore,
  pickBackupFile,
  prepareRestore,
  RestoreError,
  type RestorePlan,
} from '@/db/backup';
import { useColors } from '@/lib/theme';

/**
 * Restoring a backup from the screen that appears when the app will not open.
 *
 * This is the case the whole feature exists for. Restore normally lives behind
 * More → Backup, which is only reachable once the database opens — so the one
 * moment someone most needs their backup was the one moment they could not get
 * at it. D5 promised this path; here it is.
 *
 * Two things make it different from the Backup screen:
 *
 *   - It cannot rely on the live database for anything. `prepareRestore`
 *     stages and checks on the staged file's OWN connection, so the broken one
 *     is never touched (db/backup/restore.ts).
 *   - It restores with `recovery: true`, which changes what "keep a copy
 *     first" means: a `VACUUM INTO` of a database SQLite cannot read will
 *     fail, and here that failure is expected rather than a reason to stop, so
 *     the broken bytes are moved aside instead.
 *
 * Deliberately NOT offered before "Share a copy of my data": a restore
 * replaces what is on the phone, and the damaged file may still be the only
 * copy of the last few entries.
 */
export function RecoveryRestore({ onRestored }: { onRestored: () => void }) {
  const colors = useColors();
  const [stage, setStage] = useState<'idle' | 'passphrase' | 'confirm' | 'working'>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(fileUri: string, secret?: string) {
    setStage('working');
    setError(null);
    try {
      const checked = await prepareRestore(fileUri, secret);
      setPlan(checked);
      setStage('confirm');
    } catch (e) {
      const message = e instanceof RestoreError ? e.message : e instanceof Error ? e.message : String(e);
      if (/encrypted|passphrase/i.test(message) && !secret) {
        setUri(fileUri);
        setStage('passphrase');
        setError(null);
        return;
      }
      setError(message);
      setStage(secret ? 'passphrase' : 'idle');
    }
  }

  async function choose() {
    setError(null);
    try {
      const picked = await pickBackupFile();
      if (!picked) return;
      await check(picked.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('idle');
    }
  }

  async function apply() {
    if (!plan) return;
    setStage('working');
    setError(null);
    try {
      await applyRestore(plan, { recovery: true });
      onRestored();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('idle');
      setPlan(null);
    }
  }

  function cancel() {
    discardRestore();
    setStage('idle');
    setPlan(null);
    setPassphrase('');
    setError(null);
  }

  if (stage === 'confirm' && plan) {
    return (
      <Panel tint={colors.primary}>
        <Text weight="semibold" size={14} tone="default">
          Restore this backup?
        </Text>
        <Text weight="regular" size={13} tone="muted" style={{ lineHeight: 19 }}>
          It holds {plan.summary}. Your current data file is kept on this phone under a new name, so nothing is thrown
          away — but SpendWise will open with the backup's data.
        </Text>
        <Action label="Restore it" busy={false} primary onPress={() => void apply()} />
        <Action label="Not this one" busy={false} onPress={cancel} />
        {error ? <ErrorLine message={error} /> : null}
      </Panel>
    );
  }

  if (stage === 'passphrase') {
    return (
      <Panel tint={colors.border}>
        <Text weight="semibold" size={14} tone="default">
          This backup has a passphrase
        </Text>
        <Text weight="regular" size={13} tone="muted" style={{ lineHeight: 19 }}>
          Enter the passphrase it was made with.
        </Text>
        <TextInput
          value={passphrase}
          onChangeText={setPassphrase}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Passphrase"
          placeholderTextColor={colors.subtle}
          style={{
            color: colors.foreground,
            ...font('semibold'),
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        />
        <Action
          label="Open it"
          busy={false}
          disabled={passphrase.length < 4}
          primary
          onPress={() => void (uri && check(uri, passphrase))}
        />
        <Action label="Cancel" busy={false} onPress={cancel} />
        {error ? <ErrorLine message={error} /> : null}
      </Panel>
    );
  }

  return (
    <>
      <Action
        label={stage === 'working' ? 'Checking the backup…' : 'Restore from a backup'}
        busy={stage === 'working'}
        onPress={() => void choose()}
      />
      {error ? <ErrorLine message={error} /> : null}
    </>
  );
}

function Panel({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8, marginTop: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: tint }}>
      {children}
    </View>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <Text weight="regular" size={13} tone="expense" style={{ lineHeight: 19 }}>
      {message}
    </Text>
  );
}

/** The same button shape as BootFailure's, kept local so this screen has no dependency on the kit's theming. */
function Action({
  label,
  onPress,
  busy,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  primary?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const bg = primary ? colors.primary : colors.card;
  const fg = primary ? colors.onPrimary : colors.foreground;
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
        borderColor: colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text variant="bodyStrong" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}
