import { useEffect, useMemo, useState } from 'react';

import { useToast, Surface } from 'heroui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { UserItemState, useItem, useSetItemTags, useUserTags } from '@/hooks/use-items-trpc';
import { showError, showSuccess } from '@/lib/toast-utils';

function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeTagKey(value: string): string {
  return normalizeTagName(value).toLowerCase();
}

function sanitizeTags(tags: string[]): string[] {
  const deduped = new Map<string, string>();

  for (const tag of tags) {
    const normalizedName = normalizeTagName(tag);
    if (!normalizedName) continue;

    const normalizedKey = normalizeTagKey(normalizedName);
    if (!deduped.has(normalizedKey)) {
      deduped.set(normalizedKey, normalizedName);
    }
  }

  return Array.from(deduped.values()).slice(0, 20);
}

function getReadableTextColor(background: string): string {
  const normalized = background.replace('#', '').trim();
  const hex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;

  if (hex.length !== 6 || /[^0-9a-f]/i.test(hex)) {
    return '#FFFFFF';
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

export default function ItemTagsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { toast } = useToast();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? '');

  const { data: item, isLoading: itemLoading, error: itemError } = useItem(id);
  const { data: tagsData, isLoading: tagsLoading } = useUserTags();
  const setTagsMutation = useSetItemTags();

  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    if (!item) return;
    setSelectedTags(item.tags.map((tag) => tag.name));
  }, [item]);

  const allTags = useMemo(() => tagsData?.tags ?? [], [tagsData?.tags]);

  const initialTagKeys = useMemo(
    () => new Set((item?.tags ?? []).map((tag) => normalizeTagKey(tag.name))),
    [item?.tags]
  );

  const selectedTagKeys = useMemo(
    () => new Set(selectedTags.map((tag) => normalizeTagKey(tag))),
    [selectedTags]
  );

  const hasChanges = useMemo(() => {
    if (!item) return false;
    if (initialTagKeys.size !== selectedTagKeys.size) return true;
    for (const key of selectedTagKeys) {
      if (!initialTagKeys.has(key)) return true;
    }
    return false;
  }, [initialTagKeys, item, selectedTagKeys]);

  const normalizedQuery = normalizeTagName(query);
  const normalizedQueryKey = normalizeTagKey(query);

  const filteredTags = useMemo(() => {
    if (!normalizedQuery) return allTags;
    return allTags.filter((tag) => normalizeTagKey(tag.name).includes(normalizedQueryKey));
  }, [allTags, normalizedQuery, normalizedQueryKey]);

  const canCreateTag =
    normalizedQuery.length > 0 &&
    !allTags.some((tag) => normalizeTagKey(tag.name) === normalizedQueryKey);

  const toggleTag = (name: string) => {
    const normalizedName = normalizeTagName(name);
    const normalizedKey = normalizeTagKey(normalizedName);

    if (!normalizedName || normalizedName.length > 32) {
      return;
    }

    setSelectedTags((previous) => {
      const index = previous.findIndex((tag) => normalizeTagKey(tag) === normalizedKey);
      if (index >= 0) {
        return previous.filter((tag) => normalizeTagKey(tag) !== normalizedKey);
      }

      return sanitizeTags([...previous, normalizedName]);
    });
  };

  const handleSave = () => {
    if (!item) return;

    const sanitized = sanitizeTags(selectedTags);

    setTagsMutation.mutate(
      {
        id: item.id,
        tags: sanitized,
      },
      {
        onSuccess: () => {
          showSuccess(toast, 'Tags updated');
          router.back();
        },
        onError: (error) => {
          showError(toast, error, 'Failed to update tags', 'itemTags.save');
        },
      }
    );
  };

  if (!id) {
    return (
      <Surface style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerContent}>
            <Text style={[styles.errorText, { color: colors.text }]}>Invalid item ID</Text>
          </View>
        </SafeAreaView>
      </Surface>
    );
  }

  if (itemLoading) {
    return (
      <Surface style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerContent}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </SafeAreaView>
      </Surface>
    );
  }

  if (itemError || !item) {
    return (
      <Surface style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerContent}>
            <Text style={[styles.errorText, { color: colors.text }]}>Unable to load bookmark</Text>
          </View>
        </SafeAreaView>
      </Surface>
    );
  }

  const isBookmarked = item.state === UserItemState.BOOKMARKED;
  const primaryTextColor = getReadableTextColor(colors.primary);
  const isSaveDisabled = !isBookmarked || !hasChanges;
  const saveButtonBackground = isSaveDisabled ? colors.backgroundTertiary : colors.primary;
  const saveButtonTextColor = isSaveDisabled ? colors.textSecondary : primaryTextColor;

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Tags</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {item.title}
          </Text>
        </View>

        {!isBookmarked && (
          <View style={[styles.warningBox, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.warningText, { color: colors.textSecondary }]}>
              Only bookmarked items can have tags.
            </Text>
          </View>
        )}

        <View style={styles.searchContainer}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Add or search tags"
            placeholderTextColor={colors.textTertiary}
            editable={isBookmarked}
            style={[
              styles.searchInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.backgroundSecondary,
              },
            ]}
          />
        </View>

        <View style={styles.selectedSection}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Selected</Text>
          <View style={styles.tagWrap}>
            {selectedTags.length === 0 ? (
              <Text style={[styles.emptySelected, { color: colors.textTertiary }]}>
                No tags selected
              </Text>
            ) : (
              selectedTags.map((tag) => (
                <Pressable
                  key={normalizeTagKey(tag)}
                  onPress={() => toggleTag(tag)}
                  disabled={!isBookmarked}
                  style={({ pressed }) => [
                    styles.selectedTagChip,
                    {
                      backgroundColor: colors.primary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.selectedTagText, { color: primaryTextColor }]}>{tag} ×</Text>
                </Pressable>
              ))
            )}
          </View>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>All tags</Text>

          {canCreateTag && isBookmarked && (
            <Pressable
              onPress={() => {
                toggleTag(normalizedQuery);
                setQuery('');
              }}
              style={({ pressed }) => [
                styles.tagRow,
                {
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.tagRowLabel, { color: colors.text }]}>
                {`Create "${normalizedQuery}"`}
              </Text>
            </Pressable>
          )}

          {tagsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : filteredTags.length === 0 ? (
            <Text style={[styles.emptyList, { color: colors.textTertiary }]}>No tags yet</Text>
          ) : (
            filteredTags.map((tag) => {
              const selected = selectedTagKeys.has(normalizeTagKey(tag.name));

              return (
                <Pressable
                  key={tag.id}
                  onPress={() => toggleTag(tag.name)}
                  disabled={!isBookmarked}
                  style={({ pressed }) => [
                    styles.tagRow,
                    {
                      backgroundColor: colors.backgroundSecondary,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.tagRowLabel, { color: colors.text }]}>{tag.name}</Text>
                  {selected && (
                    <Text style={[styles.checkmark, { color: colors.primary }]}>Selected</Text>
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleSave}
            disabled={isSaveDisabled || setTagsMutation.isPending}
            style={({ pressed }) => [
              styles.saveButton,
              {
                backgroundColor: saveButtonBackground,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            {setTagsMutation.isPending ? (
              <ActivityIndicator color={saveButtonTextColor} />
            ) : (
              <Text style={[styles.saveButtonText, { color: saveButtonTextColor }]}>Save Tags</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  title: {
    ...Typography.displaySmall,
  },
  subtitle: {
    ...Typography.bodySmall,
  },
  warningBox: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  warningText: {
    ...Typography.bodySmall,
  },
  searchContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  searchInput: {
    ...Typography.bodyMedium,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  selectedSection: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.labelMedium,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  emptySelected: {
    ...Typography.bodySmall,
  },
  selectedTagChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  selectedTagText: {
    ...Typography.labelSmall,
  },
  list: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  tagRow: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagRowLabel: {
    ...Typography.bodyMedium,
  },
  checkmark: {
    ...Typography.labelSmall,
  },
  loadingRow: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyList: {
    ...Typography.bodySmall,
    paddingVertical: Spacing.md,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  saveButton: {
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    ...Typography.labelLarge,
  },
});
