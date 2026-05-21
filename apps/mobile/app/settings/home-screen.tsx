import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { useToast } from 'heroui-native';
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { HomeScreenSectionKind, type HomeScreenSettingsSectionInput } from '@zine/shared';

import { Text } from '@/components/primitives/text';
import { Colors, Radius, Spacing, Typography, type ThemeColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useHomeScreenSettings,
  useResetHomeScreenSettings,
  useUpdateHomeScreenSettings,
} from '@/hooks/use-items-trpc';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';
import { showError, showSuccess } from '@/lib/toast-utils';

type HomeScreenSettingsData = NonNullable<ReturnType<typeof useHomeScreenSettings>['data']>;
type VisibleSection = HomeScreenSettingsData['visibleSections'][number];
type BuiltInSection = Extract<VisibleSection, { kind: typeof HomeScreenSectionKind.BUILT_IN }>;
type HiddenBuiltInSection = BuiltInSection;
type AddableCollection = HomeScreenSettingsData['addableCollections'][number];

function sectionKey(section: VisibleSection | HiddenBuiltInSection): string {
  return section.kind === HomeScreenSectionKind.BUILT_IN
    ? `built-in-${section.builtInSection}`
    : `collection-${section.collectionId}`;
}

function toInputSection(
  section: VisibleSection | HiddenBuiltInSection,
  enabled: boolean
): HomeScreenSettingsSectionInput {
  if (section.kind === HomeScreenSectionKind.BUILT_IN) {
    return {
      kind: HomeScreenSectionKind.BUILT_IN,
      builtInSection: section.builtInSection,
      enabled,
    };
  }

  return {
    kind: HomeScreenSectionKind.COLLECTION,
    collectionId: section.collectionId,
    enabled: true,
  };
}

function HeaderButton({
  label,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerButton,
        {
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.headerButtonText, { color: colors.buttonPrimary }]}>{label}</Text>
    </Pressable>
  );
}

function SectionRow({
  section,
  colors,
  onToggle,
  drag,
  isActive = false,
}: {
  section: VisibleSection | HiddenBuiltInSection;
  colors: ThemeColors;
  onToggle: () => void;
  drag?: () => void;
  isActive?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isActive ? colors.cardHover : colors.card,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Drag ${section.title}`}
        disabled={!drag}
        onLongPress={drag}
        delayLongPress={120}
        hitSlop={8}
        style={({ pressed }) => [
          styles.dragHandle,
          { opacity: drag ? (pressed || isActive ? 0.8 : 1) : 0.35 },
        ]}
      >
        <Ionicons name="reorder-three-outline" size={24} color={colors.textTertiary} />
      </Pressable>
      <View style={styles.rowText}>
        <View style={styles.titleLine}>
          <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
            {section.title}
          </Text>
          {section.kind === HomeScreenSectionKind.COLLECTION ? (
            <Text style={[styles.badge, { color: colors.textSubheader }]}>Collection</Text>
          ) : null}
        </View>
        <Text style={[styles.rowSubtitle, { color: colors.textSubheader }]} numberOfLines={1}>
          {section.subtitle}
        </Text>
      </View>
      <Switch value={section.enabled} onValueChange={onToggle} />
    </View>
  );
}

function AddCollectionRow({
  collection,
  colors,
  onPress,
}: {
  collection: AddableCollection;
  colors: ThemeColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${collection.name} to Home`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.addIcon, { backgroundColor: colors.backgroundTertiary }]}>
        <Ionicons name="add" size={18} color={colors.buttonPrimary} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
          {collection.name}
        </Text>
        {collection.description ? (
          <Text style={[styles.rowSubtitle, { color: colors.textSubheader }]} numberOfLines={1}>
            {collection.description}
          </Text>
        ) : (
          <Text style={[styles.rowSubtitle, { color: colors.textSubheader }]}>Collection</Text>
        )}
      </View>
    </Pressable>
  );
}

export default function HomeScreenSettingsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { toast } = useToast();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { handleScroll, showCollapsedTitle } = useCollapsedHeaderTitle();
  const settingsQuery = useHomeScreenSettings();
  const updateMutation = useUpdateHomeScreenSettings();
  const resetMutation = useResetHomeScreenSettings();
  const [visibleSections, setVisibleSections] = useState<VisibleSection[]>([]);
  const [hiddenBuiltInSections, setHiddenBuiltInSections] = useState<HiddenBuiltInSection[]>([]);
  const [addableCollections, setAddableCollections] = useState<AddableCollection[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!settingsQuery.data || isDirty) return;
    setVisibleSections(settingsQuery.data.visibleSections);
    setHiddenBuiltInSections(
      settingsQuery.data.hiddenBuiltInSections.filter(
        (section): section is BuiltInSection => section.kind === HomeScreenSectionKind.BUILT_IN
      )
    );
    setAddableCollections(settingsQuery.data.addableCollections);
  }, [isDirty, settingsQuery.data]);

  const isSaving = updateMutation.isPending || resetMutation.isPending;
  const canSave = isDirty && !isSaving && visibleSections.length > 0;

  const inputSections = useMemo((): HomeScreenSettingsSectionInput[] => {
    return [
      ...visibleSections.map((section) => toInputSection(section, true)),
      ...hiddenBuiltInSections.map((section) => toInputSection(section, false)),
    ];
  }, [hiddenBuiltInSections, visibleSections]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const hideVisibleSection = useCallback(
    (section: VisibleSection) => {
      if (visibleSections.length <= 1) {
        Alert.alert('Keep one section visible', 'Home needs at least one visible section.');
        return;
      }

      setVisibleSections((current) =>
        current.filter((item) => sectionKey(item) !== sectionKey(section))
      );

      if (section.kind === HomeScreenSectionKind.BUILT_IN) {
        setHiddenBuiltInSections((current) => [...current, { ...section, enabled: false }]);
      } else {
        setAddableCollections((current) =>
          [
            ...current,
            { id: section.collectionId, name: section.title, description: section.subtitle },
          ].sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      markDirty();
    },
    [markDirty, visibleSections.length]
  );

  const showHiddenBuiltInSection = (section: HiddenBuiltInSection) => {
    setHiddenBuiltInSections((current) =>
      current.filter((item) => item.builtInSection !== section.builtInSection)
    );
    setVisibleSections((current) => [...current, { ...section, enabled: true }]);
    markDirty();
  };

  const addCollection = (collection: AddableCollection) => {
    setAddableCollections((current) => current.filter((item) => item.id !== collection.id));
    setVisibleSections((current) => [
      ...current,
      {
        kind: HomeScreenSectionKind.COLLECTION,
        collectionId: collection.id,
        title: collection.name,
        subtitle: collection.description,
        enabled: true,
        position: current.length + 1,
      },
    ]);
    markDirty();
  };

  const renderVisibleSection = useCallback(
    ({ item, drag, isActive }: RenderItemParams<VisibleSection>) => (
      <ScaleDecorator activeScale={1.02}>
        <SectionRow
          section={item}
          colors={colors}
          drag={drag}
          isActive={isActive}
          onToggle={() => hideVisibleSection(item)}
        />
      </ScaleDecorator>
    ),
    [colors, hideVisibleSection]
  );

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ sections: inputSections });
      setIsDirty(false);
      showSuccess(toast, 'Home screen updated', 'settings.homeScreen.save');
    } catch (error) {
      showError(toast, error, 'Failed to save Home screen', 'settings.homeScreen.save');
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Home Screen?',
      'This restores the default Home sections and removes collections from Home.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetMutation.mutateAsync();
              setIsDirty(false);
              showSuccess(toast, 'Home screen reset', 'settings.homeScreen.reset');
            } catch (error) {
              showError(toast, error, 'Failed to reset Home screen', 'settings.homeScreen.reset');
            }
          },
        },
      ]
    );
  };

  const headerRight = () => (
    <HeaderButton label="Save" disabled={!canSave} onPress={handleSave} colors={colors} />
  );
  const headerLeft = () => (
    <Pressable
      accessibilityLabel="Go back"
      onPress={() => {
        if (navigation.canGoBack()) {
          router.back();
          return;
        }

        router.replace('/(tabs)');
      }}
      hitSlop={8}
      style={styles.headerBack}
    >
      <Ionicons name="chevron-back" size={28} color={colors.text} />
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.background,
          tintColor: colors.text,
          screenTitle: 'Home Screen',
          showScreenTitle: showCollapsedTitle,
          headerLeft,
          headerRight,
        })}
      />
      <NestableScrollContainer
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={handleScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.screenHeader}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Home Screen</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textSubheader }]}>
            Choose which sections appear on Home and arrange the visible order.
          </Text>
        </View>

        {settingsQuery.isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>
              VISIBLE ON HOME
            </Text>
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <NestableDraggableFlatList
                data={visibleSections}
                keyExtractor={sectionKey}
                renderItem={renderVisibleSection}
                onDragEnd={({ data }) => {
                  setVisibleSections(data);
                  markDirty();
                }}
                activationDistance={8}
                autoscrollThreshold={80}
                autoscrollSpeed={160}
                containerStyle={styles.visibleList}
              />
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>
              HIDDEN SECTIONS
            </Text>
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              {hiddenBuiltInSections.length === 0 ? (
                <Text style={[styles.emptyRow, { color: colors.textSubheader }]}>
                  No built-in sections are hidden.
                </Text>
              ) : (
                hiddenBuiltInSections.map((section) => (
                  <SectionRow
                    key={sectionKey(section)}
                    section={section}
                    colors={colors}
                    onToggle={() => showHiddenBuiltInSection(section)}
                  />
                ))
              )}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>
              ADD COLLECTIONS
            </Text>
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              {addableCollections.length === 0 ? (
                <Text style={[styles.emptyRow, { color: colors.textSubheader }]}>
                  All collections are already on Home.
                </Text>
              ) : (
                addableCollections.map((collection) => (
                  <AddCollectionRow
                    key={collection.id}
                    collection={collection}
                    colors={colors}
                    onPress={() => addCollection(collection)}
                  />
                ))
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset Home Screen"
              disabled={isSaving}
              onPress={handleReset}
              style={({ pressed }) => [
                styles.resetButton,
                { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.resetText, { color: colors.error }]}>Reset Home Screen</Text>
            </Pressable>
          </>
        )}
      </NestableScrollContainer>
    </View>
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
    marginBottom: Spacing.sm,
  },
  screenTitle: {
    ...Typography.displayMedium,
  },
  screenSubtitle: {
    ...Typography.bodyMedium,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  section: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
    flexShrink: 1,
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
  },
  dragHandle: {
    width: 30,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibleList: {
    flexGrow: 0,
  },
  addIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRow: {
    padding: Spacing.md,
    fontSize: 14,
  },
  loadingState: {
    padding: Spacing['2xl'],
    alignItems: 'center',
  },
  resetButton: {
    marginTop: Spacing.xl,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
  },
  resetText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerBack: {
    marginLeft: -Spacing.xs,
  },
});
