import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trash2, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { Avatar } from '../../../components/ui/Avatar';
import { PressableScale } from '../../../components/ui/PressableScale';
import { fonts, useColors } from '../../../lib/theme';
import { addFriend, removeFriend, renameFriend } from '../mutations';
import { getFriends } from '../queries';
import { RoundButton } from './kit';

/** Add a friend by name, or rename / remove one. */
export function FriendForm() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
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
    if (removeFriend(editingId, initial.name).ok) router.dismissTo('/groups');
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center justify-between px-5 py-3">
        <RoundButton label="Close" onPress={() => router.back()}>
          <X size={19} color={colors.foreground} />
        </RoundButton>
        <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 16 }}>
          {editingId != null ? 'Edit friend' : 'Add a friend'}
        </Text>
        {editingId != null ? (
          <RoundButton label="Remove friend" onPress={onRemove} tint={colors.expense}>
            <Trash2 size={17} color={colors.expense} />
          </RoundButton>
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
            fontFamily: fonts.semibold,
            fontSize: 18,
            backgroundColor: colors.card,
            borderColor: colors.border,
          }}
        />
        {duplicate ? (
          <Text style={{ color: colors.warning, fontFamily: fonts.medium, fontSize: 12, marginTop: 8 }}>
            You already have a friend called {name.trim()}. That's fine — just make sure it's someone else.
          </Text>
        ) : (
          <Text
            style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginTop: 8, textAlign: 'center' }}
          >
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
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>
            {editingId != null ? 'Save' : 'Add friend'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}
