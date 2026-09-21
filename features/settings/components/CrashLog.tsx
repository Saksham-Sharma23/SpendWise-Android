import * as Sharing from 'expo-sharing';
import { FileWarning, Share2, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';

import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { clearCrashLog, crashCount, crashLogFile } from '@/lib/crashlog';
import { useColors, withAlpha } from '@/lib/theme';

/**
 * The crash log, and a way to send it.
 *
 * Hidden entirely when nothing has crashed — a permanent "0 crashes" row
 * would be clutter on the screen of the many people who never see one, and
 * an invitation to worry for the rest.
 *
 * The copy is explicit that the file carries no amounts or notes, because
 * asking someone to share a file from a finance app without saying what is
 * in it is not a reasonable thing to ask. The redaction that makes that
 * true is in `lib/crashlog/redact.ts` and is tested.
 */
export function CrashLog() {
  const colors = useColors();
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(crashCount());
  }, []);

  const share = useCallback(async () => {
    const file = crashLogFile();
    if (!file) {
      toast.error('Nothing to share');
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      toast.error('Sharing is not available on this phone');
      return;
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/plain',
      dialogTitle: 'Share the crash log',
    });
  }, []);

  const clear = useCallback(() => {
    clearCrashLog();
    setCount(0);
    toast.success('Crash log cleared');
  }, []);

  if (count === 0) return null;

  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        Diagnostics
      </Text>

      <Card className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <View
            className="h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: withAlpha(colors.warning, 0.14) }}
          >
            <FileWarning size={18} color={colors.warning} />
          </View>
          <View className="flex-1">
            <Text weight="semibold" size={14} tone="default">
              {count === 1 ? '1 error recorded' : `${count} errors recorded`}
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 1 }}>
              Kept on this phone. Nothing is sent anywhere.
            </Text>
          </View>
        </View>

        <Text variant="caption" tone="subtle" style={{ lineHeight: 18 }}>
          The log holds error messages and code locations only — no amounts, no notes, no category names and no dates.
          It is safe to send.
        </Text>

        <View className="flex-row gap-2">
          <PressableScale
            accessibilityRole="button"
            onPress={() => void share()}
            scaleTo={0.98}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl p-3"
            style={{ backgroundColor: withAlpha(colors.primary, 0.12) }}
          >
            <Share2 size={16} color={colors.primary} />
            <Text weight="semibold" size={13} style={{ color: colors.primary }}>
              Share
            </Text>
          </PressableScale>

          <PressableScale
            accessibilityRole="button"
            onPress={clear}
            scaleTo={0.98}
            className="flex-row items-center justify-center gap-2 rounded-xl px-4 p-3"
            style={{ backgroundColor: colors.elevated }}
          >
            <Trash2 size={16} color={colors.muted} />
            <Text weight="semibold" size={13} tone="muted">
              Clear
            </Text>
          </PressableScale>
        </View>
      </Card>
    </View>
  );
}
