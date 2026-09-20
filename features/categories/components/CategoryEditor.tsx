import { useRouter } from 'expo-router';
import { Check, GitMerge, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { CATEGORY_COLORS, CATEGORY_ICON_NAMES, CategoryIcon } from '@/components/ui/CategoryIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatCount } from '@/lib/money';
import { useColors, withAlpha } from '@/lib/theme';
import { appear, leave, reflow, rise } from '@/lib/motion';
import { createCategory, deleteCategory, getCategory, mergeCategory, updateCategory } from '../data/actions';
import { useCategoriesWithUsage } from '../data/hooks';
import { MAX_CATEGORY_NAME } from '../data/writes';
import { Text, font } from '@/components/ui/Text';
import { FieldLabel } from '@/components/ui/Section';

/**
 * Create or edit a category: name, colour and icon, with a live preview.
 * When editing, it also offers Merge (move everything into another category)
 * and Delete (transactions become Uncategorised). Both confirm first — there
 * is no server copy to recover a mistake from.
 */
export function CategoryEditor({ editingId }: { editingId: number | null }) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Read once: the editor holds a draft, and a live query would overwrite
  // what the user is typing whenever any category changed.
  const existing = useMemo(() => (editingId != null ? getCategory(editingId) : undefined), [editingId]);
  const all = useCategoriesWithUsage();
  const usage = all.find((c) => c.id === editingId)?.transactionCount ?? 0;

  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState<string>(existing?.icon ?? 'tag');
  const [merging, setMerging] = useState(false);

  if (editingId != null && !existing) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.background }}>
        <Text weight="medium" tone="muted">
          That category no longer exists.
        </Text>
      </View>
    );
  }

  // On failure safeWrite has already shown why ("A category called Food
  // already exists"), and the editor stays open so the name can be fixed.
  const onSave = () => {
    const input = { name, color, icon };
    const result = editingId != null ? updateCategory(editingId, input) : createCategory(input);
    if (!result.ok) return;
    toast.success(editingId != null ? 'Category updated' : `${name.trim()} created`);
    router.back();
  };

  const confirmMerge = (targetId: number, targetName: string) => {
    if (editingId == null || !existing) return;
    Alert.alert(
      `Merge into ${targetName}?`,
      `${formatCount(usage)} ${usage === 1 ? 'transaction moves' : 'transactions move'} to ${targetName}, and “${existing.name}” is removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          style: 'destructive',
          onPress: () => {
            const result = mergeCategory(editingId, targetId);
            if (!result.ok) return;
            toast.success(`Merged — ${formatCount(result.value.moved)} moved to ${targetName}`);
            router.back();
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    if (editingId == null || !existing) return;
    Alert.alert(
      `Delete ${existing.name}?`,
      usage > 0
        ? `${formatCount(usage)} ${usage === 1 ? 'transaction becomes' : 'transactions become'} Uncategorised. Nothing else is deleted.`
        : 'It is not used by any transaction.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!deleteCategory(editingId).ok) return;
            toast.success(`${existing.name} deleted`);
            router.back();
          },
        },
      ],
    );
  };

  const others = all.filter((c) => c.id !== editingId);
  const trimmed = name.trim();

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center justify-between px-5 py-3">
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          scaleTo={0.88}
          className="h-10 w-10 items-center justify-center rounded-full border"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
          <X size={19} color={colors.foreground} />
        </PressableScale>
        <Text variant="heading" tone="default">
          {editingId != null ? 'Edit category' : 'New category'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Live preview: exactly how it will look in the ledger. */}
        <Animated.View entering={rise()} className="items-center py-6">
          <Animated.View layout={reflow()}>
            <CategoryIcon icon={icon} color={color} size={76} />
          </Animated.View>
          <Text
            weight="bold"
            size={22}
            tone={trimmed ? 'default' : 'subtle'}
            numberOfLines={1}
            style={{ marginTop: 14 }}
          >
            {trimmed || 'Category name'}
          </Text>
          {editingId != null ? (
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
              {usage === 0
                ? 'Not used yet'
                : `Used by ${formatCount(usage)} ${usage === 1 ? 'transaction' : 'transactions'}`}
            </Text>
          ) : null}
        </Animated.View>

        <FieldLabel>Name</FieldLabel>
        <View className="rounded-2xl border px-4" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <TextInput
            autoFocus={editingId == null}
            value={name}
            onChangeText={setName}
            maxLength={MAX_CATEGORY_NAME}
            placeholder="e.g. Coffee"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.primary}
            returnKeyType="done"
            className="py-3.5"
            style={{ color: colors.foreground, ...font('medium', 16) }}
          />
        </View>

        <FieldLabel top>Colour</FieldLabel>
        <View className="flex-row flex-wrap gap-2.5">
          {CATEGORY_COLORS.map((c) => {
            const on = c === color;
            return (
              <PressableScale
                key={c}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: on }}
                onPress={() => setColor(c)}
                scaleTo={0.85}
                className="h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: c, borderWidth: on ? 3 : 0, borderColor: colors.foreground }}
              >
                {/* The swatch is a fixed bright colour, so the tick stays dark in both themes. */}
                {on ? <Check size={18} color={colors.onBrightFill} strokeWidth={3} /> : null}
              </PressableScale>
            );
          })}
        </View>

        <FieldLabel top>Icon</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {CATEGORY_ICON_NAMES.map((n) => {
            const on = n === icon;
            return (
              <PressableScale
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`Icon ${n}`}
                accessibilityState={{ selected: on }}
                onPress={() => setIcon(n)}
                scaleTo={0.88}
                className="rounded-2xl p-0.5"
                style={{ borderWidth: 2, borderColor: on ? color : 'transparent' }}
              >
                <CategoryIcon icon={n} color={on ? color : colors.muted} size={44} />
              </PressableScale>
            );
          })}
        </View>

        {editingId != null && existing ? (
          <View className="mt-8 gap-3">
            <FieldLabel>Manage</FieldLabel>
            {!existing.isSystem ? (
              <ActionRow
                icon={<GitMerge size={18} color={colors.foreground} />}
                title="Merge into another category"
                hint="Move its transactions, then remove it"
                onPress={() => setMerging((m) => !m)}
              />
            ) : null}
            {merging ? (
              <Animated.View entering={appear()} exiting={leave()} className="flex-row flex-wrap gap-2">
                {others.map((c) => (
                  <PressableScale
                    key={c.id}
                    accessibilityRole="button"
                    onPress={() => confirmMerge(c.id, c.name)}
                    scaleTo={0.94}
                    className="flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
                    style={{ borderColor: colors.border, backgroundColor: colors.card }}
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size={26} />
                    <Text variant="body" tone="default">
                      {c.name}
                    </Text>
                  </PressableScale>
                ))}
              </Animated.View>
            ) : null}
            {!existing.isSystem ? (
              <ActionRow
                icon={<Trash2 size={18} color={colors.expense} />}
                title="Delete category"
                hint="Its transactions become Uncategorised"
                tint={colors.expense}
                onPress={confirmDelete}
              />
            ) : (
              <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                Built-in categories can be renamed and recoloured, and other categories can be merged into them — but
                they can't be deleted.
              </Text>
            )}
          </View>
        ) : null}
      </ScrollView>

      <View
        className="px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
      >
        <PressableScale
          accessibilityRole="button"
          disabled={!trimmed}
          onPress={onSave}
          className="items-center rounded-full py-4"
          style={{ backgroundColor: colors.primary }}
        >
          <Text weight="bold" size={16} tone="onPrimary">
            {editingId != null ? 'Save changes' : 'Create category'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function ActionRow({
  icon,
  title,
  hint,
  tint,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  tint?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.98}
      className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
      style={{
        backgroundColor: tint ? withAlpha(tint, 0.06) : colors.card,
        borderColor: tint ? withAlpha(tint, 0.3) : colors.border,
      }}
    >
      {icon}
      <View className="flex-1">
        <Text variant="bodyStrong" style={{ color: tint ?? colors.foreground }}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 1 }}>
          {hint}
        </Text>
      </View>
    </PressableScale>
  );
}
