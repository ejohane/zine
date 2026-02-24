import { Stack, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Surface } from 'heroui-native';
import { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { Colors, Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePrefetchItemDetail, useTabPrefetch } from '@/hooks/use-prefetch';
import {
  useInboxItems,
  useHomeData,
  useLibraryItems,
  mapContentType,
  mapProvider,
} from '@/hooks/use-items-trpc';
import { getContentIcon } from '@/lib/content-utils';
import type { ContentType, Provider, UIContentType } from '@/lib/content-utils';

// =============================================================================
// Icons
// =============================================================================

function ChevronRightIcon({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// =============================================================================
// Components
// =============================================================================

function SectionHeader({
  title,
  count,
  colors,
  onPress,
}: {
  title: string;
  count?: number;
  colors: typeof Colors.dark;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sectionHeader} disabled={!onPress}>
      <View style={styles.sectionHeaderLeft}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        {count !== undefined && (
          <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{count}</Text>
        )}
      </View>
      {onPress && <ChevronRightIcon size={20} color={colors.textTertiary} />}
    </Pressable>
  );
}

function CategoryPill({
  label,
  count,
  color,
  colors,
  onPress,
}: {
  label: string;
  count: number;
  color: string;
  colors: typeof Colors.dark;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.categoryPill, { backgroundColor: colors.backgroundSecondary }]}
    >
      <View style={[styles.categoryDot, { backgroundColor: color }]} />
      <Text style={[styles.categoryLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.categoryCount, { color: colors.textTertiary }]}>{count}</Text>
    </Pressable>
  );
}

function JumpBackInCard({ item, colors }: { item: ItemCardData; colors: typeof Colors.dark }) {
  const router = useRouter();
  const prefetchItemDetail = usePrefetchItemDetail();

  const handlePress = () => {
    prefetchItemDetail(item.id);
    router.push(`/item/${item.id}` as Href);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.jumpBackInCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={styles.jumpBackInRow}>
        <View style={[styles.jumpBackInThumbnail, { backgroundColor: colors.backgroundTertiary }]}>
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={styles.jumpBackInThumbnailImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            getContentIcon(item.contentType, 20, colors.textTertiary)
          )}
        </View>
        <View style={styles.jumpBackInTitleWrap}>
          <Text style={[styles.jumpBackInTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const greeting = useMemo(() => getGreeting(), []);
  const isStorybookEnabled = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true';

  useTabPrefetch('home');

  // Data hooks
  const { data: inboxData, isLoading: isInboxLoading } = useInboxItems();
  const { data: homeData, isLoading: isHomeLoading } = useHomeData();
  const { data: libraryData } = useLibraryItems();

  // Transform to ItemCardData format for use with ItemCard component
  const jumpBackInItems = useMemo((): ItemCardData[] => {
    return (homeData?.jumpBackIn ?? []).slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: mapContentType(item.contentType) as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
    }));
  }, [homeData?.jumpBackIn]);

  const recentlyBookmarked = useMemo((): ItemCardData[] => {
    return (homeData?.recentBookmarks ?? []).slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: mapContentType(item.contentType) as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
    }));
  }, [homeData?.recentBookmarks]);

  const inboxItems = useMemo((): ItemCardData[] => {
    return (inboxData?.items ?? []).slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.creator,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: mapContentType(item.contentType) as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
    }));
  }, [inboxData?.items]);

  const podcasts = useMemo((): ItemCardData[] => {
    return (homeData?.byContentType.podcasts ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: 'podcast' as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
    }));
  }, [homeData?.byContentType.podcasts]);

  const videos = useMemo((): ItemCardData[] => {
    return (homeData?.byContentType.videos ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: 'video' as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
    }));
  }, [homeData?.byContentType.videos]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const items = libraryData?.items ?? [];
    return {
      podcast: items.filter((item) => item.contentType === 'PODCAST').length,
      video: items.filter((item) => item.contentType === 'VIDEO').length,
      article: items.filter((item) => item.contentType === 'ARTICLE').length,
      post: items.filter((item) => item.contentType === 'POST').length,
    };
  }, [libraryData?.items]);

  const handleCategoryPress = useCallback(
    (contentType: UIContentType) => {
      router.push({ pathname: '/(tabs)/library', params: { contentType } });
    },
    [router]
  );

  const isLoading = isInboxLoading || isHomeLoading;

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={styles.header}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting}</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Home</Text>
          </Animated.View>

          {isStorybookEnabled && (
            <Animated.View style={styles.storybookButtonContainer}>
              <Pressable
                onPress={() => router.push('/storybook')}
                style={({ pressed }) => [
                  styles.storybookButton,
                  {
                    backgroundColor: colors.backgroundSecondary,
                    borderColor: colors.border,
                  },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={[styles.storybookButtonLabel, { color: colors.primary }]}>
                  Open Storybook
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* Jump Back In - Recently Opened Bookmarks */}
              {jumpBackInItems.length > 0 && (
                <Animated.View>
                  <SectionHeader
                    title="Jump Back In"
                    count={jumpBackInItems.length}
                    colors={colors}
                  />
                  <View style={styles.jumpBackInGrid}>
                    {jumpBackInItems.map((item) => (
                      <JumpBackInCard key={item.id} item={item} colors={colors} />
                    ))}
                  </View>
                </Animated.View>
              )}

              {/* Recently Bookmarked - Horizontal Cards */}
              {recentlyBookmarked.length > 0 && (
                <Animated.View>
                  <SectionHeader
                    title="Recently Bookmarked"
                    count={recentlyBookmarked.length}
                    colors={colors}
                  />
                  <FlatList
                    horizontal
                    data={recentlyBookmarked}
                    renderItem={({ item, index }) => (
                      <ItemCard item={item} variant="horizontal" index={index} />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}

              {/* Inbox Section - Condensed List using compact ItemCard */}
              {inboxItems.length > 0 && (
                <Animated.View style={styles.section}>
                  <SectionHeader
                    title="Inbox"
                    count={inboxData?.items.length ?? 0}
                    colors={colors}
                    onPress={() => router.push('/(tabs)/inbox')}
                  />
                  <View
                    style={[styles.inboxContainer, { backgroundColor: colors.backgroundSecondary }]}
                  >
                    {inboxItems.map((item, index) => (
                      <ItemCard key={item.id} item={item} variant="compact" index={index} />
                    ))}
                  </View>
                </Animated.View>
              )}

              {/* Category Collection - Large Cards with overlay */}
              {podcasts.length > 0 && (
                <Animated.View>
                  <SectionHeader title="Podcasts" count={podcasts.length} colors={colors} />
                  <FlatList
                    horizontal
                    data={podcasts.slice(0, 5)}
                    renderItem={({ item, index }) => (
                      <ItemCard item={item} variant="large" overlay index={index} />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}

              {/* Categories */}
              <Animated.View style={styles.section}>
                <SectionHeader title="Categories" colors={colors} />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoriesContainer}
                >
                  <CategoryPill
                    label="Podcasts"
                    count={categoryCounts.podcast}
                    color={ContentColors.podcast}
                    colors={colors}
                    onPress={() => handleCategoryPress('podcast')}
                  />
                  <CategoryPill
                    label="Videos"
                    count={categoryCounts.video}
                    color={ContentColors.video}
                    colors={colors}
                    onPress={() => handleCategoryPress('video')}
                  />
                  <CategoryPill
                    label="Articles"
                    count={categoryCounts.article}
                    color={ContentColors.article}
                    colors={colors}
                    onPress={() => handleCategoryPress('article')}
                  />
                  <CategoryPill
                    label="Posts"
                    count={categoryCounts.post}
                    color={ContentColors.post}
                    colors={colors}
                    onPress={() => handleCategoryPress('post')}
                  />
                </ScrollView>
              </Animated.View>

              {/* Videos - Horizontal Cards */}
              {videos.length > 0 && (
                <Animated.View>
                  <SectionHeader title="Videos" count={videos.length} colors={colors} />
                  <FlatList
                    horizontal
                    data={videos}
                    renderItem={({ item, index }) => (
                      <ItemCard item={item} variant="horizontal" index={index} />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}
            </>
          )}

          {/* Bottom spacing for tab bar */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </Surface>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },

  // Header
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  greeting: {
    ...Typography.labelMedium,
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    ...Typography.displayMedium,
  },
  storybookButtonContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  storybookButton: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  storybookButtonLabel: {
    ...Typography.labelMedium,
    fontWeight: '700',
  },

  // Section
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.titleLarge,
  },
  sectionCount: {
    ...Typography.bodySmall,
  },

  // Horizontal List
  horizontalList: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },

  // Jump Back In Grid
  jumpBackInGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  jumpBackInCard: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    height: 72,
    overflow: 'hidden',
  },
  jumpBackInRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    height: '100%',
  },
  jumpBackInThumbnail: {
    width: 64,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpBackInThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  jumpBackInTitleWrap: {
    flex: 1,
    paddingVertical: 2,
    paddingRight: Spacing.xs,
    justifyContent: 'center',
  },
  jumpBackInTitle: {
    ...Typography.bodySmall,
    fontWeight: '600',
    lineHeight: 14,
  },

  // Inbox Container
  inboxContainer: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },

  // Categories
  categoriesContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    gap: Spacing.sm,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryLabel: {
    ...Typography.labelMedium,
  },
  categoryCount: {
    ...Typography.bodySmall,
  },

  // Loading state
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['5xl'],
  },

  // Bottom spacer
  bottomSpacer: {
    height: 40,
  },
});
