import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { appear, leave, rise } from '@/lib/motion';
import { useColors, withAlpha } from '@/lib/theme';

/**
 * A centred dialog: the shape for a question that must be answered before
 * anything happens.
 *
 * Deliberately NOT the bottom sheet the rest of the app uses. A sheet is for
 * picking something and is dismissed by swiping it away; the two questions
 * here — a passphrase, and "replace everything on this phone?" — are decisions
 * that should not be reachable by a flick of the thumb. The scrim does not
 * dismiss either, for the same reason.
 *
 * Android back DOES close it (`onRequestClose`), because a back press that
 * does nothing is how people conclude an app has frozen. Closing is always the
 * safe direction here: nothing has been changed yet.
 */
export function Dialog({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: ReactNode;
  footer: ReactNode;
}) {
  const colors = useColors();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={appear()} exiting={leave()} style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: withAlpha(colors.shadow, 0.55) }}
        />
        <KeyboardAvoidingView
          behavior="padding"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' }}
          pointerEvents="box-none"
        >
          <Animated.View
            entering={rise()}
            className="mx-5 gap-4 rounded-3xl border p-5"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <View className="gap-1.5">
              <Text variant="title" size={19} tone="default">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="caption" tone="muted" style={{ lineHeight: 19 }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {children}
            <View className="gap-2">{footer}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}
