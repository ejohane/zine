import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useToast } from 'heroui-native';
import {
  CollectionItemMembership,
  CollectionOverrideAction,
  CollectionSort,
  UserItemState,
} from '@zine/shared';

import { Text } from '@/components/primitives/text';
import { PlusCircleIcon } from '@/components/icons';
import { Radius, Spacing, Typography } from '@/constants/theme';
import {
  useCollectionsForItem,
  useCreateCollection,
  useSetCollectionItemOverride,
} from '@/hooks/use-items-trpc';
import { showError, showSuccess } from '@/lib/toast-utils';

import type { ItemDetailColors, ItemDetailItem } from '../types';

type ItemCollectionsSheetProps = {
  item: ItemDetailItem;
  colors: ItemDetailColors;
  visible: boolean;
  onClose: () => void;
};

function getMembershipLabel(membership: string): string {
  switch (membership) {
    case CollectionItemMembership.INCLUDED_BY_RULES:
      return 'Included by rules';
    case CollectionItemMembership.PINNED:
      return 'Added manually';
    case CollectionItemMembership.HIDDEN:
      return 'Hidden';
    default:
      return 'Add';
  }
}

function getMembershipPillLabel(membership: string): string {
  switch (membership) {
    case CollectionItemMembership.INCLUDED_BY_RULES:
    case CollectionItemMembership.PINNED:
      return '';
    case CollectionItemMembership.HIDDEN:
      return 'Hidden';
    default:
      return 'Add';
  }
}

function getActionAccessibilityLabel(collectionName: string, membership: string): string {
  switch (membership) {
    case CollectionItemMembership.INCLUDED_BY_RULES:
      return `Hide ${collectionName} from this collection`;
    case CollectionItemMembership.PINNED:
      return `Remove ${collectionName} from this collection`;
    case CollectionItemMembership.HIDDEN:
      return `Unhide ${collectionName} in this collection`;
    default:
      return `Add to ${collectionName}`;
  }
}

function getNextOverrideAction(membership: string) {
  switch (membership) {
    case CollectionItemMembership.INCLUDED_BY_RULES:
      return CollectionOverrideAction.HIDE;
    case CollectionItemMembership.PINNED:
    case CollectionItemMembership.HIDDEN:
      return null;
    default:
      return CollectionOverrideAction.PIN;
  }
}

function isChecked(membership: string): boolean {
  return (
    membership === CollectionItemMembership.INCLUDED_BY_RULES ||
    membership === CollectionItemMembership.PINNED
  );
}

export function ItemCollectionsSheet({
  item,
  colors,
  visible,
  onClose,
}: ItemCollectionsSheetProps) {
  const { toast } = useToast();
  const collectionsQuery = useCollectionsForItem(visible ? item.id : '');
  const createCollectionMutation = useCreateCollection();
  const setOverrideMutation = useSetCollectionItemOverride();
  const [newCollectionName, setNewCollectionName] = useState('');

  const collections = collectionsQuery.data?.collections ?? [];
  const canCreate = item.state === UserItemState.BOOKMARKED && newCollectionName.trim().length > 0;
  const isMutating = createCollectionMutation.isPending || setOverrideMutation.isPending;

  const subtitle = useMemo(() => {
    if (item.title.length <= 96) {
      return item.title;
    }

    return `${item.title.slice(0, 93)}...`;
  }, [item.title]);

  const handleToggleCollection = (collection: (typeof collections)[number]) => {
    const action = getNextOverrideAction(collection.membership);

    setOverrideMutation.mutate(
      {
        collectionId: collection.id,
        userItemId: item.id,
        action,
      },
      {
        onSuccess: () => {
          showSuccess(toast, action === CollectionOverrideAction.HIDE ? 'Hidden' : 'Updated');
        },
        onError: (error) => {
          showError(toast, error, 'Failed to update collection', 'collections.toggleItem');
        },
      }
    );
  };

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!canCreate || isMutating) {
      return;
    }

    try {
      const collection = await createCollectionMutation.mutateAsync({
        name,
        description: null,
        rules: {},
        sort: CollectionSort.NEWEST_SAVED,
      });

      await setOverrideMutation.mutateAsync({
        collectionId: collection.id,
        userItemId: item.id,
        action: CollectionOverrideAction.PIN,
      });

      setNewCollectionName('');
      showSuccess(toast, 'Collection created');
    } catch (error) {
      showError(toast, error, 'Failed to create collection', 'collections.createFromItem');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropPressTarget} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Add to collection</Text>
            <Text style={[styles.subtitle, { color: colors.textSubheader }]} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>

          <View style={styles.createRow}>
            <TextInput
              value={newCollectionName}
              onChangeText={setNewCollectionName}
              placeholder="New collection name"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: colors.border,
                },
              ]}
              returnKeyType="done"
              onSubmitEditing={handleCreateCollection}
            />
            <Pressable
              onPress={handleCreateCollection}
              disabled={!canCreate || isMutating}
              accessibilityRole="button"
              accessibilityLabel="Create collection"
              style={({ pressed }) => [
                styles.createButton,
                {
                  backgroundColor: canCreate ? colors.primary : colors.backgroundTertiary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {createCollectionMutation.isPending ? (
                <ActivityIndicator color={colors.overlayForeground} />
              ) : (
                <PlusCircleIcon size={22} color={colors.overlayForeground} />
              )}
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {collectionsQuery.isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : collections.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                Create a collection to organize this bookmark.
              </Text>
            ) : (
              collections.map((collection) => {
                const checked = isChecked(collection.membership);
                const hidden = collection.membership === CollectionItemMembership.HIDDEN;
                const pillLabel = getMembershipPillLabel(collection.membership);
                const pillBorderColor = hidden ? colors.statusWarning : colors.border;
                const pillBackgroundColor = hidden
                  ? colors.statusWarningSurface
                  : colors.backgroundTertiary;
                const pillTextColor = checked
                  ? colors.statusSuccess
                  : hidden
                    ? colors.statusWarning
                    : colors.textSubheader;

                return (
                  <Pressable
                    key={collection.id}
                    onPress={() => handleToggleCollection(collection)}
                    disabled={setOverrideMutation.isPending}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={getActionAccessibilityLabel(
                      collection.name,
                      collection.membership
                    )}
                    style={({ pressed }) => [
                      styles.collectionRow,
                      {
                        backgroundColor: colors.backgroundSecondary,
                        borderColor: checked
                          ? colors.primary
                          : hidden
                            ? colors.statusWarning
                            : colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={styles.collectionCopy}>
                      <Text style={[styles.collectionName, { color: colors.text }]}>
                        {collection.name}
                      </Text>
                      <Text style={[styles.collectionMeta, { color: colors.textTertiary }]}>
                        {getMembershipLabel(collection.membership)}
                      </Text>
                    </View>
                    <View
                      style={
                        checked
                          ? styles.checkOnly
                          : [
                              styles.statusPill,
                              {
                                borderColor: pillBorderColor,
                                backgroundColor: pillBackgroundColor,
                              },
                            ]
                      }
                    >
                      {checked ? (
                        <Text style={[styles.statusIcon, { color: pillTextColor }]}>✓</Text>
                      ) : null}
                      {pillLabel ? (
                        <Text style={[styles.statusPillText, { color: pillTextColor }]}>
                          {pillLabel}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.doneButton,
                {
                  backgroundColor: colors.backgroundSecondary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.doneText, { color: colors.text }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdropPressTarget: {
    flex: 1,
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  title: {
    ...Typography.headlineSmall,
  },
  subtitle: {
    ...Typography.bodySmall,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  input: {
    flex: 1,
    ...Typography.bodyMedium,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    minHeight: 180,
  },
  listContent: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  loadingRow: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...Typography.bodyMedium,
    paddingVertical: Spacing.lg,
    textAlign: 'center',
  },
  collectionRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  collectionCopy: {
    flex: 1,
    gap: 2,
  },
  collectionName: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
  collectionMeta: {
    ...Typography.bodySmall,
  },
  statusPill: {
    minWidth: 68,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
  },
  checkOnly: {
    width: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
  statusPillText: {
    ...Typography.labelSmallPlain,
    fontWeight: '700',
  },
  footer: {
    borderTopWidth: 1,
    padding: Spacing.md,
  },
  doneButton: {
    minHeight: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    ...Typography.labelLarge,
  },
});
