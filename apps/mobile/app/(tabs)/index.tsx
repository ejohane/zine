import { Stack, useRouter } from 'expo-router';
import { Surface } from 'heroui-native';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Colors, Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useInboxItems,
  useHomeData,
  formatDuration,
  useLibraryItems,
} from '@/hooks/use-items-trpc';

// =============================================================================
// Types
// =============================================================================

interface ContentItem {
  id: string;
  title: string;
  source: string;
  imageUrl: string | null;
  duration: string | null;
  type: 'podcast' | 'video' | 'article' | 'post';
}

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

function mapContentType(type: string): ContentItem['type'] {
  const typeMap: Record<string, ContentItem['type']> = {
    VIDEO: 'video',
    PODCAST: 'podcast',
    ARTICLE: 'article',
    POST: 'post',
  };
  return typeMap[type] ?? 'article';
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

function HorizontalCard({
  item,
  colors,
  onPress,
}: {
  item: ContentItem;
  colors: typeof Colors.dark;
  onPress: () => void;
}) {
  const typeColor = ContentColors[item.type];

  return (
    <Pressable
      onPress={onPress}
      style={[styles.horizontalCard, { backgroundColor: colors.backgroundSecondary }]}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.horizontalCardImage}
          contentFit="cover"
        />
      ) : (
        <View
          style={[styles.horizontalCardImage, { backgroundColor: colors.backgroundTertiary }]}
        />
      )}
      <View style={styles.horizontalCardContent}>
        <Text style={[styles.horizontalCardTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.horizontalCardMeta}>
          <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
          <Text
            style={[styles.horizontalCardSource, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {item.source}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function LargeCard({
  item,
  colors,
  onPress,
}: {
  item: ContentItem;
  colors: typeof Colors.dark;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.largeCard}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.largeCardImage} contentFit="cover" />
      ) : (
        <View style={[styles.largeCardImage, { backgroundColor: colors.backgroundTertiary }]} />
      )}
      <View style={styles.largeCardOverlay}>
        <Text style={styles.largeCardSource}>{item.source}</Text>
        <Text style={styles.largeCardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.duration && <Text style={styles.largeCardDuration}>{item.duration}</Text>}
      </View>
    </Pressable>
  );
}

function CondensedListItem({
  item,
  colors,
  onPress,
}: {
  item: ContentItem;
  colors: typeof Colors.dark;
  onPress: () => void;
}) {
  const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);

  return (
    <Pressable onPress={onPress} style={styles.condensedItem}>
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.condensedItemImage}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.condensedItemImage, { backgroundColor: colors.backgroundTertiary }]} />
      )}
      <View style={styles.condensedItemContent}>
        <Text style={[styles.condensedItemTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.condensedItemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.source} · {typeLabel}
          {item.duration ? ` · ${item.duration}` : ''}
        </Text>
      </View>
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

// =============================================================================
// Main Screen
// =============================================================================

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const greeting = useMemo(() => getGreeting(), []);

  // Data hooks
  const { data: inboxData, isLoading: isInboxLoading } = useInboxItems();
  const { data: homeData, isLoading: isHomeLoading } = useHomeData();
  const { data: libraryData } = useLibraryItems();

  // Transform to ContentItem format
  const recentlyBookmarked = useMemo((): ContentItem[] => {
    return (homeData?.recentBookmarks ?? []).slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      source: item.publisher ?? item.creator,
      imageUrl: item.thumbnailUrl,
      duration: item.duration ? formatDuration(item.duration) : null,
      type: mapContentType(item.contentType),
    }));
  }, [homeData?.recentBookmarks]);

  const inboxItems = useMemo((): ContentItem[] => {
    return (inboxData?.items ?? []).slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      source: item.creator,
      imageUrl: item.thumbnailUrl,
      duration: item.duration ? formatDuration(item.duration) : null,
      type: mapContentType(item.contentType),
    }));
  }, [inboxData?.items]);

  const podcasts = useMemo((): ContentItem[] => {
    return (homeData?.byContentType.podcasts ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      source: item.publisher ?? item.creator,
      imageUrl: item.thumbnailUrl,
      duration: item.duration ? formatDuration(item.duration) : null,
      type: 'podcast',
    }));
  }, [homeData?.byContentType.podcasts]);

  const videos = useMemo((): ContentItem[] => {
    return (homeData?.byContentType.videos ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      source: item.publisher ?? item.creator,
      imageUrl: item.thumbnailUrl,
      duration: item.duration ? formatDuration(item.duration) : null,
      type: 'video',
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

  const handleItemPress = (id: string) => {
    router.push(`/item/${id}`);
  };

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
          <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting}</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Home</Text>
          </Animated.View>

          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* Recently Bookmarked - Horizontal Cards */}
              {recentlyBookmarked.length > 0 && (
                <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                  <SectionHeader
                    title="Recently Bookmarked"
                    count={recentlyBookmarked.length}
                    colors={colors}
                  />
                  <FlatList
                    horizontal
                    data={recentlyBookmarked}
                    renderItem={({ item }) => (
                      <HorizontalCard
                        item={item}
                        colors={colors}
                        onPress={() => handleItemPress(item.id)}
                      />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}

              {/* Inbox Section - Condensed List */}
              {inboxItems.length > 0 && (
                <Animated.View
                  entering={FadeInDown.delay(200).duration(400)}
                  style={styles.section}
                >
                  <SectionHeader
                    title="Inbox"
                    count={inboxData?.items.length ?? 0}
                    colors={colors}
                    onPress={() => router.push('/(tabs)/inbox')}
                  />
                  <View
                    style={[styles.inboxContainer, { backgroundColor: colors.backgroundSecondary }]}
                  >
                    {inboxItems.map((item) => (
                      <CondensedListItem
                        key={item.id}
                        item={item}
                        colors={colors}
                        onPress={() => handleItemPress(item.id)}
                      />
                    ))}
                  </View>
                </Animated.View>
              )}

              {/* Category Collection - Large Cards */}
              {podcasts.length > 0 && (
                <Animated.View entering={FadeInDown.delay(300).duration(400)}>
                  <SectionHeader title="Podcasts" count={podcasts.length} colors={colors} />
                  <FlatList
                    horizontal
                    data={podcasts.slice(0, 5)}
                    renderItem={({ item }) => (
                      <LargeCard
                        item={item}
                        colors={colors}
                        onPress={() => handleItemPress(item.id)}
                      />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}

              {/* Categories */}
              <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.section}>
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
                    onPress={() => router.push('/(tabs)/library')}
                  />
                  <CategoryPill
                    label="Videos"
                    count={categoryCounts.video}
                    color={ContentColors.video}
                    colors={colors}
                    onPress={() => router.push('/(tabs)/library')}
                  />
                  <CategoryPill
                    label="Articles"
                    count={categoryCounts.article}
                    color={ContentColors.article}
                    colors={colors}
                    onPress={() => router.push('/(tabs)/library')}
                  />
                  <CategoryPill
                    label="Posts"
                    count={categoryCounts.post}
                    color={ContentColors.post}
                    colors={colors}
                    onPress={() => router.push('/(tabs)/library')}
                  />
                </ScrollView>
              </Animated.View>

              {/* Videos - Horizontal Cards */}
              {videos.length > 0 && (
                <Animated.View entering={FadeInDown.delay(500).duration(400)}>
                  <SectionHeader title="Videos" count={videos.length} colors={colors} />
                  <FlatList
                    horizontal
                    data={videos}
                    renderItem={({ item }) => (
                      <HorizontalCard
                        item={item}
                        colors={colors}
                        onPress={() => handleItemPress(item.id)}
                      />
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

  // Horizontal Card
  horizontalCard: {
    width: 200,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  horizontalCardImage: {
    width: '100%',
    height: 112,
  },
  horizontalCardContent: {
    padding: Spacing.md,
  },
  horizontalCardTitle: {
    ...Typography.bodyMedium,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  horizontalCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  horizontalCardSource: {
    ...Typography.bodySmall,
    flex: 1,
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Large Card
  largeCard: {
    width: 280,
    height: 180,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  largeCardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  largeCardOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  largeCardSource: {
    ...Typography.labelSmall,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: Spacing.xs,
  },
  largeCardTitle: {
    ...Typography.titleMedium,
    color: '#FFFFFF',
    marginBottom: Spacing.xs,
  },
  largeCardDuration: {
    ...Typography.bodySmall,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Inbox Container
  inboxContainer: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },

  // Condensed Item
  condensedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  condensedItemImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    marginRight: Spacing.md,
  },
  condensedItemContent: {
    flex: 1,
    justifyContent: 'center',
  },
  condensedItemTitle: {
    ...Typography.bodyMedium,
    fontWeight: '500',
    marginBottom: 2,
  },
  condensedItemMeta: {
    ...Typography.bodySmall,
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
