import { Stack, useRouter } from 'expo-router';
import { Surface } from 'heroui-native';
import { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BookmarkIcon,
  HeadphonesIcon,
  PlayIcon,
  SettingsIcon,
  VideoIcon,
} from '@/components/icons';
import {
  ContentCard,
  FeaturedCard,
  QuickStats,
  SectionHeader,
  type ContentItem,
  type FeaturedContentItem,
  type LocalProvider,
  type QuickStatsData,
} from '@/components/home';
import { ItemCard, type ItemCardData } from '@/components/item-card';
import { Colors, Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useBookmarkedItems,
  useInboxItems,
  mapContentType,
  type ItemWithUserState,
} from '@/hooks/use-items';
import {
  useHomeData,
  formatDuration,
  useLibraryItems as useTRPCLibraryItems,
} from '@/hooks/use-items-trpc';

import type { ContentType as UIContentType, Provider } from '@/lib/content-utils';
import type { ContentType as ContentTypeEnum } from '@zine/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.42;

// =============================================================================
// Transform Function: Domain -> UI Types
// =============================================================================

/**
 * Transform domain ItemWithUserState to ItemCardData (for shared ItemCard component)
 */
function transformToItemCardData({ item, userItem }: ItemWithUserState): ItemCardData {
  // Infer provider from canonicalUrl (uppercase for Provider type)
  const urlLower = item.canonicalUrl?.toLowerCase() ?? '';
  let inferredProvider: Provider = 'RSS';
  if (urlLower.includes('youtube')) inferredProvider = 'YOUTUBE';
  else if (urlLower.includes('spotify')) inferredProvider = 'SPOTIFY';
  else if (urlLower.includes('substack')) inferredProvider = 'SUBSTACK';

  return {
    id: userItem.id,
    title: item.title ?? 'Untitled',
    creator: item.publisher ?? item.creator ?? 'Unknown',
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: mapContentType(
      (item.contentType ?? 'ARTICLE') as ContentTypeEnum
    ) as UIContentType,
    provider: inferredProvider,
    duration: item.duration ?? null,
    bookmarkedAt: userItem.bookmarkedAt ?? null,
    publishedAt: item.publishedAt ?? null,
  };
}

// =============================================================================
// Static Mock Data (kept for featured section only)
// =============================================================================

// Featured content is curated/editorial, kept as static for now
const featuredContent: FeaturedContentItem = {
  id: 'featured-1',
  title: 'The Art of Calm Technology',
  subtitle: 'How to design products that respect human attention',
  source: 'Substack',
  gradient: ['#6366F1', '#8B5CF6'],
};

// =============================================================================
// Utility Functions
// =============================================================================

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// =============================================================================
// Main Screen
// =============================================================================

/**
 * Transform ItemView from tRPC to ContentItem for ContentCard component
 */
function transformToContentItem(item: {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  creator: string;
  publisher: string | null;
  provider: string;
  contentType: string;
  duration: number | null;
}): ContentItem {
  // Map provider to lowercase for ContentCard
  const providerMap: Record<string, LocalProvider> = {
    YOUTUBE: 'youtube',
    SPOTIFY: 'spotify',
    SUBSTACK: 'substack',
    RSS: 'substack', // RSS doesn't have a specific color, use substack as fallback
  };

  // Map content type to lowercase
  const typeMap: Record<string, 'video' | 'podcast' | 'article' | 'post'> = {
    VIDEO: 'video',
    PODCAST: 'podcast',
    ARTICLE: 'article',
    POST: 'post',
  };

  return {
    id: item.id,
    title: item.title,
    source: item.publisher ?? item.creator,
    provider: providerMap[item.provider] ?? 'substack',
    type: typeMap[item.contentType] ?? 'article',
    thumbnailUrl: item.thumbnailUrl ?? undefined,
    duration: item.duration ? formatDuration(item.duration) : undefined,
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const greeting = useMemo(() => getGreeting(), []);
  const dateStr = useMemo(() => formatDate(), []);

  // Data hooks for live data
  const bookmarkedItemsData = useBookmarkedItems();
  const inboxItemsData = useInboxItems();

  // Home data hook for curated sections (podcasts, videos, etc.)
  const { data: homeData, isLoading: isHomeLoading } = useHomeData();

  // Library data with loading state for stats
  const { data: libraryData, isLoading: isLibraryLoading } = useTRPCLibraryItems();

  // Compute quick stats from real data
  const quickStats = useMemo((): QuickStatsData => {
    const items = libraryData?.items ?? [];

    // Saved count: total bookmarked items
    const savedCount = items.length;

    // In Progress count: items that have been started but not finished
    // (items with progress object that has position > 0 and not finished)
    const inProgressCount = items.filter(
      (item) => item.progress && item.progress.position > 0 && !item.isFinished
    ).length;

    // This Week count: items bookmarked in the last 7 days
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeekCount = items.filter((item) => {
      if (!item.bookmarkedAt) return false;
      const bookmarkedTime =
        typeof item.bookmarkedAt === 'string'
          ? new Date(item.bookmarkedAt).getTime()
          : item.bookmarkedAt;
      return bookmarkedTime > oneWeekAgo;
    }).length;

    return { savedCount, inProgressCount, thisWeekCount };
  }, [libraryData?.items]);

  // Transform to ItemCardData for shared ItemCard component (live data sections)
  const jumpBackInCards = useMemo(
    () => bookmarkedItemsData.map(transformToItemCardData),
    [bookmarkedItemsData]
  );

  const recentInboxCards = useMemo(
    () => inboxItemsData.map(transformToItemCardData),
    [inboxItemsData]
  );

  // Transform home data for ContentCard sections
  const podcasts = useMemo(
    () => (homeData?.byContentType.podcasts ?? []).map(transformToContentItem),
    [homeData?.byContentType.podcasts]
  );

  const videos = useMemo(
    () => (homeData?.byContentType.videos ?? []).map(transformToContentItem),
    [homeData?.byContentType.videos]
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerShown: false,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              style={styles.settingsButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <SettingsIcon size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting}</Text>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Your Library</Text>
                <Text style={[styles.dateText, { color: colors.textTertiary }]}>{dateStr}</Text>
              </View>
              <Pressable
                onPress={() => router.push('/settings')}
                style={[styles.settingsButton, { backgroundColor: colors.backgroundSecondary }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <SettingsIcon size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
          </Animated.View>

          {/* Quick Stats */}
          <QuickStats colors={colors} stats={quickStats} isLoading={isLibraryLoading} />

          {/* Featured Card */}
          <View style={styles.section}>
            <FeaturedCard item={featuredContent} colors={colors} />
          </View>

          {/* Jump Back In - Live tRPC Data (Bookmarked Items) */}
          <View style={styles.section}>
            <SectionHeader
              title="Jump Back In"
              icon={<PlayIcon size={20} color={colors.primary} />}
              colors={colors}
            />
            {jumpBackInCards.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {jumpBackInCards.map((item, index) => (
                  <ItemCard key={item.id} item={item} variant="large" index={index} />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: colors.textTertiary }]}>
                  No bookmarked items yet. Bookmark some content to see it here!
                </Text>
              </View>
            )}
          </View>

          {/* Recent Inbox - Live tRPC Data */}
          <View style={styles.section}>
            <SectionHeader
              title="Recent Inbox"
              icon={<BookmarkIcon size={20} color={ContentColors.article} />}
              colors={colors}
            />
            {recentInboxCards.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {recentInboxCards.map((item, index) => (
                  <View key={item.id} style={{ width: CARD_WIDTH }}>
                    <ItemCard item={item} variant="compact" index={index} />
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: colors.textTertiary }]}>
                  No items in your inbox yet.
                </Text>
              </View>
            )}
          </View>

          {/* Podcasts - Live tRPC Data */}
          <View style={styles.section}>
            <SectionHeader
              title="Podcasts"
              icon={<HeadphonesIcon size={20} color={ContentColors.podcast} />}
              colors={colors}
            />
            {isHomeLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : podcasts.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {podcasts.map((item, index) => (
                  <ContentCard
                    key={item.id}
                    item={item}
                    colors={colors}
                    index={index}
                    variant="square"
                    onPress={() => router.push(`/item/${item.id}` as any)}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: colors.textTertiary }]}>
                  No podcasts in your library yet.
                </Text>
              </View>
            )}
          </View>

          {/* Videos - Live tRPC Data */}
          <View style={styles.section}>
            <SectionHeader
              title="Videos"
              icon={<VideoIcon size={20} color={ContentColors.video} />}
              colors={colors}
            />
            {isHomeLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : videos.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {videos.map((item, index) => (
                  <ContentCard
                    key={item.id}
                    item={item}
                    colors={colors}
                    index={index}
                    variant="wide"
                    onPress={() => router.push(`/item/${item.id}` as any)}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateText, { color: colors.textTertiary }]}>
                  No videos in your library yet.
                </Text>
              </View>
            )}
          </View>

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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  greeting: {
    ...Typography.labelMedium,
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    ...Typography.displayMedium,
    marginBottom: Spacing.xs,
  },
  dateText: {
    ...Typography.bodyMedium,
  },

  // Sections
  section: {
    marginBottom: Spacing['2xl'],
  },

  // Horizontal scroll
  horizontalScrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 40,
  },

  // Empty state
  emptyState: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  emptyStateText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },

  // Loading state
  loadingState: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
});
