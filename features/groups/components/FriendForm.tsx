import { useRouter } from 'expo-router';
import { Trash2, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { useColors } from '@/lib/theme';
import { addFriend, removeFriend, renameFriend, undoRemoveFriend } from '../data/actions';
import { toastWithUndo } from './undoToast';
import { getFriends } from '../data/hooks';

import { Text, font } from '@/components/ui/Text';
import { IconButton } from '@/components/ui/IconButton';

/** Add a friend by name, or rename / remove one. */
export function FriendForm({ editingId }: { editingId: number | null }) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [initial] = useState(() => (editingId != null ? getFriends().find((f) => f.id === editingId) : undefined));
  const [name, setName] = useState(initial?.name ?? '');
  const submitting = useRef(false);

  const duplicate = getFriends().some(
    (f) => f.id !== editingId && f.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );

  const onSave = () => {
    if (submitting.current) return;
    submitting.current = true;
    const result = editingId != null ? renameFriend(editingId, name) : addFriend(name);
    if (!result.ok) {
      submitting.current = false;
      return;
    }
    toast.success(editingId != null ? 'Saved' : `${name.trim()} added`);
    router.back();
  };

  const onRemove = () => {
    if (editingId == null || !initial) return;
    if (!removeFriend(editingId).ok) return;
    toastWithUndo(`${initial.name} removed`, () => undoRemoveFriend(editingId));
    router.dismissTo('/groups');
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center justify-between px-5 py-3">
        <IconButton size="lg" label="Close" onPress={() => router.back()}>
          <X size={19} color={colors.foreground} />
        </IconButton>
        <Text variant="heading" tone="default">
          {editingId != null ? 'Edit friend' : 'Add a friend'}
        </Text>
        {editingId != null ? (
          <IconButton size="lg" label="Remove friend" onPress={onRemove} tint={colors.expense}>
            <Trash2 size={17} color={colors.expense} />
          </IconButton>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <View className="flex-1 items-center px-5 pt-10">
        <Avatar name={name.trim() || '?'} size={88} />
        <TextInput
          autoFocus
          value={name}
          onChangeText={setName}
          onSubmitEditing={onSave}
          returnKeyType="done"
          placeholder="Their name"
          placeholderTextColor={colors.subtle}
          selectionColor={colors.primary}
          className="mt-6 w-full rounded-2xl border px-4 py-4 text-center"
          style={{
            color: colors.foreground,
            ...font('semibold', 18),
            backgroundColor: colors.card,
            borderColor: colors.border,
          }}
        />
        {duplicate ? (
          <Text variant="small" tone="warning" style={{ marginTop: 8 }}>
            You already have a friend called {name.trim()}. That's fine — just make sure it's someone else.
          </Text>
        ) : (
          <Text variant="caption" tone="subtle" style={{ marginTop: 8, textAlign: 'center' }}>
            Only a name. Nobody is invited or notified.
          </Text>
        )}
      </View>

      <View className="px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <PressableScale
          accessibilityRole="button"
          onPress={onSave}
          className="items-center rounded-full py-4"
          style={{ backgroundColor: colors.primary }}
        >
          <Text weight="bold" size={16} tone="onPrimary">
            {editingId != null ? 'Save' : 'Add friend'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}
