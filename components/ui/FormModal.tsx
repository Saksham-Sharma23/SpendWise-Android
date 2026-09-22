import { useRouter } from 'expo-router';
import { Trash2, X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { createSubmitGate, type GateResult } from '@/lib/submitGate';
import { useColors } from '@/lib/theme';
import { Button } from './Button';
import { IconButton, ICON_BUTTON_SIZE } from './IconButton';
import { Text } from './Text';

/**
 * The full-screen form every add/edit modal shares (R4-3): a close · title ·
 * delete header, the scrolling fields, and a sticky primary button that rides
 * above the keyboard.
 *
 *   const { submit, run, busy } = useSubmitOnce((v: Values) => save(v));
 *   <FormModal
 *     title={editing ? 'Edit budget' : 'New budget'}
 *     onDelete={editing ? () => run(remove) : undefined}
 *     deleteLabel="Delete budget"
 *     primary={{ label: 'Set budget', onPress: handleSubmit(submit), busy }}
 *     missing={editing && !initial ? 'That budget no longer exists' : undefined}
 *   >
 *     …fields…
 *   </FormModal>
 *
 * It owns `KeyboardAvoidingView behavior="padding"`, the one source of
 * keyboard padding (CLAUDE.md, Edge-to-edge). `missing` is for an edit of a
 * row deleted elsewhere: it toasts that message, goes back and renders nothing.
 */
export function FormModal({
  title,
  onClose,
  onDelete,
  deleteLabel = 'Delete',
  primary,
  missing,
  children,
}: {
  title: string;
  onClose?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  primary: { label: string; onPress: () => void; busy?: boolean; glow?: boolean };
  missing?: string;
  children: ReactNode;
}) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const close = onClose ?? (() => router.back());

  useEffect(() => {
    if (!missing) return;
    toast.error(missing);
    router.back();
  }, [missing, router]);

  if (missing) return null;

  return (
    <KeyboardAvoidingView
      // No `behavior` on Android. The activity is `adjustResize` (Expo's
      // default), so the system already shrinks the window to the space above
      // the keyboard; `behavior="padding"` then padded an ALREADY shortened
      // frame, and the form visibly jumped as the keyboard came up. This view
      // stays as the single owner of keyboard layout — it simply lets the
      // system do the work on the one platform this app ships to.
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center justify-between px-5 py-3">
        <IconButton label="Close" onPress={close}>
          <X size={19} color={colors.foreground} />
        </IconButton>
        <Text variant="heading" tone="default">
          {title}
        </Text>
        {onDelete ? (
          <IconButton label={deleteLabel} onPress={onDelete} tint={colors.expense}>
            <Trash2 size={17} color={colors.expense} />
          </IconButton>
        ) : (
          <View style={{ width: ICON_BUTTON_SIZE.md }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        className="px-5"
      >
        {children}
      </ScrollView>

      <View
        className="px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
      >
        <Button label={primary.label} onPress={primary.onPress} busy={primary.busy} glow={primary.glow} />
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * One write per form, however hard Save is hammered (lib/submitGate).
 *
 * `submit(...args)` runs `fn` through the gate: pass it to `handleSubmit`.
 * `run(other)` sends another action (delete) through the SAME gate, so a
 * delete can't race a save. `busy` drives the button.
 */
export function useSubmitOnce<A extends unknown[]>(fn: (...args: A) => GateResult) {
  const [busy, setBusy] = useState(false);
  // One gate for the form's lifetime; `submit` is rebuilt each render, so it always calls the latest `fn`.
  const [gate] = useState(() => createSubmitGate(setBusy));
  return {
    busy,
    submit: (...args: A) => {
      gate.run(() => fn(...args));
    },
    run: (other: () => GateResult) => {
      gate.run(other);
    },
  };
}
