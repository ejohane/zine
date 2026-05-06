import { useMemo, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useToast } from 'heroui-native';
import {
  CollectionSort,
  ContentType,
  Provider,
  type CollectionRules,
  type CollectionSortValue,
} from '@zine/shared';

import { Text } from '@/components/primitives/text';
import { Colors, Radius, Spacing, Typography, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useCollections,
  useCreateCollection,
  useDeleteCollection,
  useUpdateCollection,
  useUserTags,
} from '@/hooks/use-items-trpc';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';
import { showError, showSuccess } from '@/lib/toast-utils';

type CollectionListItem = NonNullable<
  ReturnType<typeof useCollections>['data']
>['collections'][number];
type FinishFilter = 'ANY' | 'FINISHED' | 'UNFINISHED';

type CollectionFormState = {
  id?: string;
  name: string;
  description: string;
  contentTypes: ContentType[];
  providers: Provider[];
  tagIds: string[];
  finishFilter: FinishFilter;
  minLengthMinutes: string;
  maxLengthMinutes: string;
  search: string;
  sort: CollectionSortValue;
};

const contentTypeOptions = [
  { value: ContentType.ARTICLE, label: 'Articles' },
  { value: ContentType.PODCAST, label: 'Podcasts' },
  { value: ContentType.VIDEO, label: 'Videos' },
  { value: ContentType.POST, label: 'Posts' },
] as const;

const providerOptions = [
  { value: Provider.WEB, label: 'Web' },
  { value: Provider.RSS, label: 'RSS' },
  { value: Provider.SUBSTACK, label: 'Substack' },
  { value: Provider.GMAIL, label: 'Gmail' },
  { value: Provider.YOUTUBE, label: 'YouTube' },
  { value: Provider.SPOTIFY, label: 'Spotify' },
  { value: Provider.X, label: 'X' },
] as const;

const finishOptions = [
  { value: 'ANY', label: 'Any' },
  { value: 'UNFINISHED', label: 'Unfinished' },
  { value: 'FINISHED', label: 'Finished' },
] as const;

const sortOptions = [
  { value: CollectionSort.NEWEST_SAVED, label: 'Newest saved' },
  { value: CollectionSort.OLDEST_SAVED, label: 'Oldest saved' },
  { value: CollectionSort.SHORTEST, label: 'Shortest' },
  { value: CollectionSort.LONGEST, label: 'Longest' },
  { value: CollectionSort.RECENTLY_OPENED, label: 'Recently opened' },
] as const;

const emptyForm: CollectionFormState = {
  name: '',
  description: '',
  contentTypes: [],
  providers: [],
  tagIds: [],
  finishFilter: 'ANY',
  minLengthMinutes: '',
  maxLengthMinutes: '',
  search: '',
  sort: CollectionSort.NEWEST_SAVED,
};

function rulesToFinishFilter(rules: CollectionRules): FinishFilter {
  if (rules.isFinished === true) return 'FINISHED';
  if (rules.isFinished === false) return 'UNFINISHED';
  return 'ANY';
}

function collectionToForm(collection: CollectionListItem): CollectionFormState {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description ?? '',
    contentTypes: collection.rules.contentTypes ?? [],
    providers: collection.rules.providers ?? [],
    tagIds: collection.rules.tagIds ?? [],
    finishFilter: rulesToFinishFilter(collection.rules),
    minLengthMinutes:
      collection.rules.minLengthMinutes === undefined
        ? ''
        : String(collection.rules.minLengthMinutes),
    maxLengthMinutes:
      collection.rules.maxLengthMinutes === undefined
        ? ''
        : String(collection.rules.maxLengthMinutes),
    search: collection.rules.search ?? '',
    sort: collection.sort as CollectionSortValue,
  };
}

function parseMinuteInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formToRules(form: CollectionFormState): CollectionRules {
  const minLengthMinutes = parseMinuteInput(form.minLengthMinutes);
  const maxLengthMinutes = parseMinuteInput(form.maxLengthMinutes);
  const rules: CollectionRules = {};

  if (form.contentTypes.length > 0) rules.contentTypes = form.contentTypes;
  if (form.providers.length > 0) rules.providers = form.providers;
  if (form.tagIds.length > 0) rules.tagIds = form.tagIds;
  if (form.finishFilter === 'FINISHED') rules.isFinished = true;
  if (form.finishFilter === 'UNFINISHED') rules.isFinished = false;
  if (minLengthMinutes !== undefined) rules.minLengthMinutes = minLengthMinutes;
  if (maxLengthMinutes !== undefined) rules.maxLengthMinutes = maxLengthMinutes;
  if (form.search.trim()) rules.search = form.search.trim();

  return rules;
}

function getRuleSummary(rules: CollectionRules): string {
  const parts: string[] = [];
  if (rules.contentTypes?.length) parts.push(`${rules.contentTypes.length} types`);
  if (rules.providers?.length) parts.push(`${rules.providers.length} sources`);
  if (rules.tagIds?.length) parts.push(`${rules.tagIds.length} tags`);
  if (rules.isFinished === true) parts.push('Finished');
  if (rules.isFinished === false) parts.push('Unfinished');
  if (rules.minLengthMinutes !== undefined || rules.maxLengthMinutes !== undefined) {
    const min = rules.minLengthMinutes ?? 0;
    const max = rules.maxLengthMinutes;
    parts.push(max === undefined ? `${min}+ min` : `${min}-${max} min`);
  }
  if (rules.search) parts.push(`"${rules.search}"`);
  return parts.length > 0 ? parts.join(' • ') : 'Manual collection';
}

function toggleOption<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function SettingsCollectionsScreen() {
  const { toast } = useToast();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { handleScroll, showCollapsedTitle } = useCollapsedHeaderTitle();
  const collectionsQuery = useCollections();
  const tagsQuery = useUserTags();
  const createCollectionMutation = useCreateCollection();
  const updateCollectionMutation = useUpdateCollection();
  const deleteCollectionMutation = useDeleteCollection();
  const [form, setForm] = useState<CollectionFormState | null>(null);

  const collections = collectionsQuery.data?.collections ?? [];
  const tags = tagsQuery.data?.tags ?? [];
  const isSaving = createCollectionMutation.isPending || updateCollectionMutation.isPending;
  const isDeleting = deleteCollectionMutation.isPending;
  const canSave = Boolean(form?.name.trim()) && !isSaving && !isDeleting;

  const headerRight = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create collection"
      onPress={() => setForm(emptyForm)}
      hitSlop={8}
      style={styles.headerButton}
    >
      <Ionicons name="add" size={28} color={colors.text} />
    </Pressable>
  );

  const handleSave = async () => {
    if (!form || !canSave) return;

    const minLengthMinutes = parseMinuteInput(form.minLengthMinutes);
    const maxLengthMinutes = parseMinuteInput(form.maxLengthMinutes);
    if (
      minLengthMinutes !== undefined &&
      maxLengthMinutes !== undefined &&
      minLengthMinutes > maxLengthMinutes
    ) {
      showError(
        toast,
        new Error('Minimum length cannot be greater than maximum length.'),
        'Check the length range',
        'settings.collections.length'
      );
      return;
    }

    const input = {
      name: form.name,
      description: form.description.trim() || null,
      rules: formToRules(form),
      sort: form.sort,
    };

    try {
      if (form.id) {
        await updateCollectionMutation.mutateAsync({ id: form.id, ...input });
        showSuccess(toast, 'Collection updated');
      } else {
        await createCollectionMutation.mutateAsync(input);
        showSuccess(toast, 'Collection created');
      }
      setForm(null);
    } catch (error) {
      showError(toast, error, 'Failed to save collection', 'settings.collections.save');
    }
  };

  const handleDelete = () => {
    if (!form?.id) return;

    Alert.alert('Delete collection?', 'This removes the collection but keeps your bookmarks.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCollectionMutation.mutateAsync({ id: form.id! });
            showSuccess(toast, 'Collection deleted');
            setForm(null);
          } catch (error) {
            showError(toast, error, 'Failed to delete collection', 'settings.collections.delete');
          }
        },
      },
    ]);
  };

  const rulePreview = useMemo(() => (form ? getRuleSummary(formToRules(form)) : ''), [form]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.background,
          tintColor: colors.text,
          screenTitle: 'Collections',
          showScreenTitle: showCollapsedTitle,
          headerRight,
        })}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={handleScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenHeader}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Collections</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textSubheader }]}>
            Save filters as collections, then manually add or hide bookmarks anytime.
          </Text>
        </View>

        {collectionsQuery.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : collections.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No collections yet</Text>
            <Text style={[styles.emptyCopy, { color: colors.textSubheader }]}>
              Create a manual collection or a saved filter for your bookmarks.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setForm(emptyForm)}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.buttonPrimary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.buttonPrimaryText }]}>
                Create Collection
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            {collections.map((collection) => (
              <Pressable
                key={collection.id}
                onPress={() => setForm(collectionToForm(collection))}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.collectionRow,
                  { borderBottomColor: colors.border },
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.collectionCopy}>
                  <Text style={[styles.collectionTitle, { color: colors.text }]}>
                    {collection.name}
                  </Text>
                  <Text style={[styles.collectionMeta, { color: colors.textSubheader }]}>
                    {getRuleSummary(collection.rules)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={form !== null} animationType="slide" presentationStyle="pageSheet">
        {form ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.modalContainer, { backgroundColor: colors.background }]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={() => setForm(null)} hitSlop={8}>
                <Text style={[styles.modalAction, { color: colors.textSubheader }]}>Cancel</Text>
              </Pressable>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {form.id ? 'Edit Collection' : 'New Collection'}
              </Text>
              <Pressable onPress={handleSave} disabled={!canSave} hitSlop={8}>
                <Text
                  style={[
                    styles.modalAction,
                    { color: canSave ? colors.text : colors.textTertiary },
                  ]}
                >
                  Save
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <FieldLabel label="Name" colors={colors} />
              <TextInput
                value={form.name}
                onChangeText={(name) => setForm({ ...form, name })}
                placeholder="Collection name"
                placeholderTextColor={colors.textTertiary}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.backgroundSecondary,
                  },
                ]}
              />

              <FieldLabel label="Description" colors={colors} optional />
              <TextInput
                value={form.description}
                onChangeText={(description) => setForm({ ...form, description })}
                placeholder="Optional note"
                placeholderTextColor={colors.textTertiary}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.backgroundSecondary,
                  },
                ]}
              />

              <RuleSection title="Content type" colors={colors}>
                {contentTypeOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={form.contentTypes.includes(option.value)}
                    colors={colors}
                    onPress={() =>
                      setForm({
                        ...form,
                        contentTypes: toggleOption(form.contentTypes, option.value),
                      })
                    }
                  />
                ))}
              </RuleSection>

              <RuleSection title="Source" colors={colors}>
                {providerOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={form.providers.includes(option.value)}
                    colors={colors}
                    onPress={() =>
                      setForm({
                        ...form,
                        providers: toggleOption(form.providers, option.value),
                      })
                    }
                  />
                ))}
              </RuleSection>

              <RuleSection title="Tags" colors={colors}>
                {tags.length === 0 ? (
                  <Text style={[styles.helperText, { color: colors.textTertiary }]}>
                    No tags created yet.
                  </Text>
                ) : (
                  tags.map((tag) => (
                    <Chip
                      key={tag.id}
                      label={tag.name}
                      selected={form.tagIds.includes(tag.id)}
                      colors={colors}
                      onPress={() =>
                        setForm({
                          ...form,
                          tagIds: toggleOption(form.tagIds, tag.id),
                        })
                      }
                    />
                  ))
                )}
              </RuleSection>

              <RuleSection title="Status" colors={colors}>
                {finishOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={form.finishFilter === option.value}
                    colors={colors}
                    onPress={() => setForm({ ...form, finishFilter: option.value })}
                  />
                ))}
              </RuleSection>

              <RuleSection title="Length" colors={colors}>
                <View style={styles.lengthRow}>
                  <TextInput
                    value={form.minLengthMinutes}
                    onChangeText={(minLengthMinutes) => setForm({ ...form, minLengthMinutes })}
                    placeholder="Min"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                    style={[
                      styles.lengthInput,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.backgroundSecondary,
                      },
                    ]}
                  />
                  <Text style={[styles.lengthSeparator, { color: colors.textTertiary }]}>to</Text>
                  <TextInput
                    value={form.maxLengthMinutes}
                    onChangeText={(maxLengthMinutes) => setForm({ ...form, maxLengthMinutes })}
                    placeholder="Max"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                    style={[
                      styles.lengthInput,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.backgroundSecondary,
                      },
                    ]}
                  />
                  <Text style={[styles.lengthSeparator, { color: colors.textTertiary }]}>min</Text>
                </View>
              </RuleSection>

              <FieldLabel label="Search terms" colors={colors} optional />
              <TextInput
                value={form.search}
                onChangeText={(search) => setForm({ ...form, search })}
                placeholder="Title, creator, or publisher"
                placeholderTextColor={colors.textTertiary}
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.backgroundSecondary,
                  },
                ]}
              />

              <RuleSection title="Sort" colors={colors}>
                {sortOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={form.sort === option.value}
                    colors={colors}
                    onPress={() => setForm({ ...form, sort: option.value })}
                  />
                ))}
              </RuleSection>

              <View style={[styles.preview, { backgroundColor: colors.backgroundSecondary }]}>
                <Text style={[styles.previewLabel, { color: colors.textTertiary }]}>Preview</Text>
                <Text style={[styles.previewText, { color: colors.text }]}>{rulePreview}</Text>
              </View>

              {form.id ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleDelete}
                  disabled={isDeleting}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    {
                      borderColor: colors.statusError,
                      opacity: pressed || isDeleting ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.deleteText, { color: colors.statusError }]}>
                    Delete Collection
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>
    </View>
  );
}

function FieldLabel({
  label,
  optional,
  colors,
}: {
  label: string;
  optional?: boolean;
  colors: ThemeColors;
}) {
  return (
    <Text style={[styles.fieldLabel, { color: colors.textSubheader }]}>
      {label}
      {optional ? ' (optional)' : ''}
    </Text>
  );
}

function RuleSection({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ThemeColors;
  children: ReactNode;
}) {
  return (
    <View style={styles.ruleSection}>
      <FieldLabel label={title} colors={colors} optional />
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  selected,
  colors,
  onPress,
}: {
  label: string;
  selected: boolean;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.buttonPrimary : colors.backgroundSecondary,
          borderColor: selected ? colors.buttonPrimary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.buttonPrimaryText : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  screenHeader: {
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  screenTitle: {
    ...Typography.displayMedium,
  },
  screenSubtitle: {
    ...Typography.bodyMedium,
  },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  collectionRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: {
    opacity: 0.7,
  },
  collectionCopy: {
    flex: 1,
    gap: 4,
  },
  collectionTitle: {
    ...Typography.bodyLarge,
    fontWeight: '700',
  },
  collectionMeta: {
    ...Typography.bodySmall,
  },
  loadingState: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.headlineSmall,
  },
  emptyCopy: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  primaryButtonText: {
    ...Typography.labelLarge,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
  },
  modalTitle: {
    ...Typography.labelLarge,
  },
  modalAction: {
    ...Typography.labelLarge,
    minWidth: 56,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  fieldLabel: {
    ...Typography.labelSmallPlain,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  textInput: {
    ...Typography.bodyMedium,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  ruleSection: {
    marginBottom: Spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
  },
  chipText: {
    ...Typography.labelMedium,
  },
  helperText: {
    ...Typography.bodySmall,
  },
  lengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lengthInput: {
    ...Typography.bodyMedium,
    width: 82,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
  },
  lengthSeparator: {
    ...Typography.bodyMedium,
  },
  preview: {
    borderRadius: Radius.lg,
    gap: 4,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  previewLabel: {
    ...Typography.labelSmallPlain,
    textTransform: 'uppercase',
  },
  previewText: {
    ...Typography.bodyMedium,
  },
  deleteButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  deleteText: {
    ...Typography.labelLarge,
  },
});
