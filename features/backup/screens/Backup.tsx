import { useCallback, useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  AlertTriangle,
  DatabaseBackup,
  FileJson,
  FolderOpen,
  Lock,
  RotateCcw,
  Share2,
  ShieldCheck,
} from 'lucide-react-native';
import { toast } from 'sonner-native';

import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { font, Text } from '@/components/ui/Text';
import { describeSize, describeStamp, type BackupFileInfo, type RestorePlan } from '@/db/backup';
import { rise } from '@/lib/motion';
import { useColors, withAlpha } from '@/lib/theme';
import { Dialog } from '../components/Dialog';
import {
  cancelRestore,
  checkBackup,
  chooseBackupFile,
  confirmRestore,
  lastBackupAt,
  runExport,
  savedBackups,
  shareSavedBackup,
  type ExportFormat,
} from '../data/actions';

/**
 * Backup & restore (Phase 7).
 *
 * The screen is arranged around the one thing that actually matters: whether a
 * copy of this data exists anywhere but this phone. That answer is at the top,
 * stated plainly, because "you have never backed up" is the single most useful
 * sentence this app can show someone.
 *
 * Restoring is deliberately further down and slower: it asks, it says what it
 * found in the file, and it names what it is about to replace.
 */
export function Backup() {
  const colors = useColors();
  const [last, setLast] = useState<string | null>(null);
  const [files, setFiles] = useState<BackupFileInfo[]>([]);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const [askPassphrase, setAskPassphrase] = useState<'export' | 'restore' | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [pending, setPending] = useState<BackupFileInfo | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [restoring, setRestoring] = useState(false);

  const refresh = useCallback(() => {
    setFiles(savedBackups());
    setLast(lastBackupAt());
  }, []);

  useEffect(refresh, [refresh]);

  const doExport = useCallback(
    async (format: ExportFormat, secret?: string) => {
      setBusy(format);
      try {
        const result = await runExport(format, secret);
        if (result.ok) toast.success(result.message ?? 'Backup saved');
      } finally {
        setBusy(null);
        refresh();
      }
    },
    [refresh],
  );

  const startRestore = useCallback(async (file: BackupFileInfo, secret?: string) => {
    const outcome = await checkBackup(file.uri, secret);
    if (outcome.ok && outcome.plan) {
      setAskPassphrase(null);
      setPassphrase('');
      setPlan(outcome.plan);
      return;
    }
    if (outcome.needsPassphrase && !secret) {
      setPending(file);
      setAskPassphrase('restore');
      return;
    }
    toast.error(outcome.message ?? 'That backup could not be read');
  }, []);

  const applyPlan = useCallback(async () => {
    if (!plan) return;
    setRestoring(true);
    const outcome = await confirmRestore(plan);
    setRestoring(false);
    setPlan(null);
    if (outcome.ok) {
      toast.success(`Restored ${plan.summary}`);
    } else {
      toast.error(outcome.message ?? 'Nothing was changed');
    }
    refresh();
  }, [plan, refresh]);

  const never = last == null;

  return (
    <Screen back title="Backup & restore" subtitle="Your data lives only on this phone">
      <View className="gap-6 px-5">
        <Animated.View entering={rise()}>
          <View
            className="flex-row items-center gap-3 rounded-2xl border p-4"
            style={{
              backgroundColor: never ? withAlpha(colors.warning, 0.12) : colors.primarySoft,
              borderColor: never ? withAlpha(colors.warning, 0.3) : colors.primaryBorder,
            }}
          >
            {never ? (
              <AlertTriangle size={20} color={colors.warning} />
            ) : (
              <ShieldCheck size={20} color={colors.primary} />
            )}
            <View className="flex-1">
              <Text weight="semibold" size={14} tone="default">
                {never ? 'No backup yet' : `Last backup ${describeWhen(last)}`}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2, lineHeight: 18 }}>
                {never
                  ? 'If this phone is lost or reset, everything in SpendWise goes with it. A backup takes one tap.'
                  : 'Keep the file somewhere off this phone — a cloud drive, or a computer.'}
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={rise(40)} className="gap-3">
          <Text variant="label" tone="muted">
            Save a backup
          </Text>
          <Card className="p-1">
            <Option
              icon={DatabaseBackup}
              tint={colors.primary}
              label="Everything, exactly as it is"
              hint="One file with every record. The fastest to restore."
              busy={busy === 'db'}
              onPress={() => void doExport('db')}
            />
            <Option
              icon={Lock}
              tint={colors.income}
              label="Protected with a passphrase"
              hint="The same file, encrypted. Only you can open it."
              busy={busy === 'encrypted-db'}
              onPress={() => {
                setPassphrase('');
                setAskPassphrase('export');
              }}
            />
            <Option
              icon={FileJson}
              tint={colors.warning}
              label="Readable file"
              hint="Every row as text. Restores even after the app changes."
              busy={busy === 'json'}
              onPress={() => void doExport('json')}
            />
          </Card>
        </Animated.View>

        <Animated.View entering={rise(80)} className="gap-3">
          <Text variant="label" tone="muted">
            Restore
          </Text>
          <Card className="p-1">
            <Option
              icon={FolderOpen}
              tint={colors.foreground}
              label="Restore from a file"
              hint="Choose a backup from your phone or a cloud drive."
              busy={false}
              onPress={() => {
                void (async () => {
                  const file = await chooseBackupFile();
                  if (file) await startRestore(file);
                })();
              }}
            />
          </Card>
        </Animated.View>

        <Animated.View entering={rise(120)} className="gap-3">
          <Text variant="label" tone="muted">
            On this phone
          </Text>
          {files.length === 0 ? (
            <Card className="p-4">
              <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                Backups you make are kept here too, so a dismissed share sheet never means no backup. They are not
                included in Android's own backup — the point of an export is that it leaves the phone.
              </Text>
            </Card>
          ) : (
            <Card className="p-1">
              {files.map((file) => (
                <SavedFile
                  key={file.uri}
                  file={file}
                  onShare={() => void shareSavedBackup(file)}
                  onRestore={() => void startRestore(file)}
                />
              ))}
            </Card>
          )}
        </Animated.View>
      </View>

      <Dialog
        visible={askPassphrase !== null}
        title={askPassphrase === 'export' ? 'Choose a passphrase' : 'Enter the passphrase'}
        subtitle={
          askPassphrase === 'export'
            ? 'It is not stored anywhere, and it cannot be reset or recovered. If you forget it, this backup is gone — there is no way in, for you or for us.'
            : 'The passphrase this backup was made with.'
        }
        onClose={() => {
          setAskPassphrase(null);
          setPassphrase('');
        }}
        footer={
          <>
            <Button
              label={askPassphrase === 'export' ? 'Create the backup' : 'Open it'}
              disabled={passphrase.length < 4}
              onPress={() => {
                const secret = passphrase;
                if (askPassphrase === 'export') {
                  setAskPassphrase(null);
                  setPassphrase('');
                  void doExport('encrypted-db', secret);
                } else if (pending) {
                  void startRestore(pending, secret);
                }
              }}
            />
            <Button
              label="Cancel"
              variant="ghost"
              size="md"
              onPress={() => {
                setAskPassphrase(null);
                setPassphrase('');
              }}
            />
          </>
        }
      >
        <TextInput
          value={passphrase}
          onChangeText={setPassphrase}
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="At least 4 characters"
          placeholderTextColor={colors.subtle}
          className="rounded-2xl border px-4 py-3.5"
          style={{
            backgroundColor: colors.elevated,
            borderColor: colors.border,
            color: colors.foreground,
            ...font('medium', 16),
          }}
        />
      </Dialog>

      <Dialog
        visible={plan !== null}
        title="Replace everything on this phone?"
        subtitle={
          plan
            ? `This backup holds ${plan.summary}. Everything currently in SpendWise is replaced by it. A copy of what you have now is saved first, so this can be undone.`
            : undefined
        }
        onClose={() => {
          cancelRestore();
          setPlan(null);
        }}
        footer={
          <>
            <Button label="Restore" variant="destructive" busy={restoring} spinner onPress={() => void applyPlan()} />
            <Button
              label="Keep what I have"
              variant="ghost"
              size="md"
              onPress={() => {
                cancelRestore();
                setPlan(null);
              }}
            />
          </>
        }
      >
        {plan && plan.warnings.length > 0 ? (
          <View className="gap-1.5 rounded-2xl p-3" style={{ backgroundColor: withAlpha(colors.warning, 0.12) }}>
            {plan.warnings.map((w) => (
              <Text key={w.message} variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                {w.message}
              </Text>
            ))}
          </View>
        ) : null}
      </Dialog>
    </Screen>
  );
}

function Option({
  icon: Icon,
  tint,
  label,
  hint,
  busy,
  onPress,
}: {
  icon: typeof DatabaseBackup;
  tint: string;
  label: string;
  hint: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      accessibilityState={{ busy }}
      onPress={onPress}
      scaleTo={0.98}
      className="flex-row items-center gap-3 p-3"
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: withAlpha(tint, 0.14) }}
      >
        <Icon size={18} color={tint} />
      </View>
      <View className="flex-1">
        <Text weight="semibold" size={14} tone="default">
          {label}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 1, lineHeight: 17 }}>
          {busy ? 'Working…' : hint}
        </Text>
      </View>
    </PressableScale>
  );
}

const FORMAT_LABEL: Record<BackupFileInfo['format'], string> = {
  db: 'Full copy',
  'encrypted-db': 'Protected',
  json: 'Readable',
};

const KIND_LABEL: Record<BackupFileInfo['kind'], string | null> = {
  export: null,
  'pre-restore': 'Saved before a restore',
  'failed-restore': 'A restore that would not open',
};

function SavedFile({ file, onShare, onRestore }: { file: BackupFileInfo; onShare: () => void; onRestore: () => void }) {
  const colors = useColors();
  return (
    <View className="flex-row items-center gap-3 p-3">
      <View className="flex-1">
        <Text weight="semibold" size={14} tone="default">
          {describeStamp(file.stamp)}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 1 }}>
          {KIND_LABEL[file.kind] ?? FORMAT_LABEL[file.format]} · {describeSize(file.size)}
        </Text>
      </View>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Share the backup from ${describeStamp(file.stamp)}`}
        onPress={onShare}
        className="h-10 w-10 items-center justify-center rounded-full border"
        style={{ borderColor: colors.border, backgroundColor: colors.elevated }}
      >
        <Share2 size={16} color={colors.foreground} />
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Restore the backup from ${describeStamp(file.stamp)}`}
        onPress={onRestore}
        className="h-10 w-10 items-center justify-center rounded-full border"
        style={{ borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft }}
      >
        <RotateCcw size={16} color={colors.primary} />
      </PressableScale>
    </View>
  );
}

function describeWhen(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return 'recently';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}
