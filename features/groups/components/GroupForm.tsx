import { useRouter } from 'expo-router';
import { Check, Plus, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Switch, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { Avatar } from '@/components/ui/Avatar';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { deterministicColor, deterministicIcon } from '@/lib/identity';
import { useColors, withAlpha } from '@/lib/theme';
import { rise } from '@/lib/motion';
import { addFriend, addGroup, editGroup, removeGroup, undoRemoveGroup } from '../data/actions';
import { toastWithUndo } from './undoToast';
import { getFriends, getGroupRow, getMembers } from '../data/hooks';

import { Text, font } from '@/components/ui/Text';
import { IconButton } from '@/components/ui/IconButton';
import { FieldLabel } from '@/components/ui/Section';

const GROUP_ICONS = [
  'plane',
  'house',
  'utensils',
  'car',
  'gift',
  'sparkles',
  'shopping-bag',
  'beer',
  'coffee',
  'heart-pulse',
  'graduation-cap',
  'wallet',
];

/**
 * Create or edit a group: a name, an icon, who is in it, and whether to
 * simplify debts. You are always in the group, so you are not listed.
 */
export function GroupForm({ editingId }: { editingId: number | null }) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [initial] = useState(() => (editingId != null ? getGroupRow(editingId) : undefined));
  const [friends, setFriends] = useState(getFriends);
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [simplify, setSimplify] = useState(initial?.simplifyDebts ?? true);
  const [memberIds, setMemberIds] = useState<Set<number>>(() =>
    editingId != null
      ? new Set(
          getMembers(editingId)
            .filter((m) => !m.isSelf)
            .map((m) => m.id),
        )
      : new Set(),
  );
  const [newFriend, setNewFriend] = useState('');
  const submitting = useRef(false);

  useEffect(() => {
    if (editingId != null && !initial) {
      toast.error('That group no longer exists');
      router.back();
    }
  }, [editingId, initial, router]);

  const shownIcon = icon ?? deterministicIcon(name || 'Group');
  const tint = deterministicColor(name || 'Group');

  const toggle = (id: number) =>
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onAddFriend = () => {
    if (!newFriend.trim()) return;
    const result = addFriend(newFriend);
    if (!result.ok) return;
    setFriends(getFriends());
    setMemberIds((prev) => new Set(prev).add(result.value));
    setNewFriend('');
  };

  const onSave = () => {
    if (submitting.current) return;
    submitting.current = true;
    const input = { name, icon, simplifyDebts: simplify, memberIds: [...memberIds] };
    const result = editingId != null ? editGroup(editingId, input) : addGroup(input);
    if (!result.ok) {
      submitting.current = false;
      return;
    }
    if (editingId != null) {
      toast.success('Group saved');
      router.back();
    } else {
      toast.success(`${name.trim()} is ready — add the first expense`);
      router.replace({ pathname: '/groups/[id]', params: { id: String(result.value) } });
    }
  };

  const onDelete = () => {
    if (editingId == null) return;
    Alert.alert(
      `Delete ${initial?.name ?? 'this group'}?`,
      'Its expenses and balances disappear with it. You can undo straight after.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!removeGroup(editingId).ok) return;
            toastWithUndo(`${initial?.name ?? 'Group'} deleted`, () => undoRemoveGroup(editingId));
            router.dismissTo('/groups');
          },
        },
      ],
    );
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
          {editingId != null ? 'Edit group' : 'New group'}
        </Text>
        {editingId != null ? (
          <IconButton size="lg" label="Delete group" onPress={onDelete} tint={colors.expense}>
            <Trash2 size={17} color={colors.expense} />
          </IconButton>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Animated.View entering={rise()} className="mt-2 flex-row items-center gap-3">
          <CategoryIcon icon={shownIcon} color={tint} size={54} />
          <TextInput
            autoFocus={editingId == null}
            value={name}
            onChangeText={setName}
            placeholder="Goa trip, Flat 4B, Office lunch…"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.primary}
            className="flex-1 rounded-2xl border px-4 py-3.5"
            style={{
              color: colors.foreground,
              ...font('semibold', 16),
              backgroundColor: colors.card,
              borderColor: colors.border,
            }}
          />
        </Animated.View>

        <Animated.View entering={rise(60)} className="mt-6">
          <FieldLabel>Icon</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {GROUP_ICONS.map((name) => {
              const on = shownIcon === name;
              return (
                <PressableScale
                  key={name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={name}
                  onPress={() => setIcon(on && icon != null ? null : name)}
                  scaleTo={0.9}
                  className="rounded-2xl p-1"
                  style={{ borderWidth: 2, borderColor: on ? tint : 'transparent' }}
                >
                  <CategoryIcon icon={name} color={tint} size={40} />
                </PressableScale>
              );
            })}
          </ScrollView>
        </Animated.View>

        <Animated.View entering={rise(120)} className="mt-6">
          <FieldLabel>{`Who's in · you + ${memberIds.size}`}</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {friends.map((f) => {
              const on = memberIds.has(f.id);
              return (
                <PressableScale
                  key={f.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(f.id)}
                  scaleTo={0.94}
                  className="flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
                  style={{
                    borderColor: on ? colors.primaryBorder : colors.border,
                    backgroundColor: on ? colors.primarySoft : colors.card,
                  }}
                >
                  <Avatar name={f.name} size={26} />
                  <Text weight={on ? 'semibold' : 'medium'} size={13} tone={on ? 'default' : 'muted'}>
                    {f.name}
                  </Text>
                  {on ? <Check size={14} color={colors.primary} strokeWidth={2.6} /> : null}
                </PressableScale>
              );
            })}
          </View>
          <View className="mt-3 flex-row items-center gap-2">
            <TextInput
              value={newFriend}
              onChangeText={setNewFriend}
              onSubmitEditing={onAddFriend}
              returnKeyType="done"
              placeholder="Add someone new"
              placeholderTextColor={colors.subtle}
              selectionColor={colors.primary}
              className="flex-1 rounded-2xl border px-4 py-3"
              style={{
                color: colors.foreground,
                ...font('medium', 14),
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            />
            <IconButton size="lg" label="Add friend" onPress={onAddFriend} look="filled">
              <Plus size={20} color={colors.onPrimary} strokeWidth={2.6} />
            </IconButton>
          </View>
          <Text variant="caption" tone="subtle" style={{ marginTop: 8 }}>
            Just a name — nobody gets invited, and nothing leaves your phone.
          </Text>
        </Animated.View>

        <Animated.View entering={rise(180)} className="mt-6">
          <View
            className="flex-row items-center gap-3 rounded-2xl border p-4"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <View className="flex-1">
              <Text variant="bodyStrong" tone="default">
                Simplify group debts
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 3, lineHeight: 17 }}>
                Settle up in the fewest payments. You might pay someone you didn't borrow from directly — what everyone
                owes overall never changes.
              </Text>
            </View>
            <Switch
              value={simplify}
              onValueChange={setSimplify}
              trackColor={{ false: colors.borderStrong, true: withAlpha(colors.primary, 0.5) }}
              thumbColor={simplify ? colors.primary : colors.card}
              accessibilityLabel="Simplify group debts"
            />
          </View>
        </Animated.View>
      </ScrollView>

      <View
        className="px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
      >
        <PressableScale
          accessibilityRole="button"
          onPress={onSave}
          className="items-center rounded-full py-4"
          style={{ backgroundColor: colors.primary }}
        >
          <Text weight="bold" size={16} tone="onPrimary">
            {editingId != null ? 'Save group' : 'Create group'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}
