import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Surface } from 'heroui-native';
import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Dimensions } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  Colors,
  Typography,
  Spacing,
  Radius,
  Shadows,
  ContentColors,
  ProviderColors,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useBookmarkedItems,
  useInboxItems,
  mapContentType,
  formatDuration,
  type ItemWithUserState,
} from '@/hooks/use-items';
import type { ContentType as ContentTypeEnum } from '@zine/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.42;
const HERO_CARD_HEIGHT = 200;

// =============================================================================
// Icons
// =============================================================================

function PlayIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5.14v14l11-7-11-7z" />
    </Svg>
  );
}

function BookmarkIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
    </Svg>
  );
}

function HeadphonesIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
    </Svg>
  );
}

function VideoIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
    </Svg>
  );
}

function ArticleIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
    </Svg>
  );
}

function ChevronRightIcon({ size = 20, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </Svg>
  );
}

function SparklesIcon({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 3L14 8L19 9L15 13L16 18L12 15L8 18L9 13L5 9L10 8L12 3Z" />
    </Svg>
  );
}

// =============================================================================
// Types & Mock Data
// =============================================================================

type ContentType = 'podcast' | 'video' | 'article' | 'post';
type Provider = 'youtube' | 'spotify' | 'substack' | 'twitter' | 'pocket';

interface ContentItem {
  id: string;
  title: string;
  subtitle?: string;
  source: string;
  provider: Provider;
  type: ContentType;
  thumbnailUrl?: string;
  duration?: string;
  progress?: number;
  publishedAt?: string;
  gradient?: [string, string];
}

// =============================================================================
// Transform Function: Domain -> UI Types
// =============================================================================

/**
 * Map domain provider to UI provider
 * Handles providers that may not be directly represented in UI
 */
const providerMap: Record<string, Provider> = {
  youtube: 'youtube',
  spotify: 'spotify',
  substack: 'substack',
  rss: 'substack', // fallback for RSS feeds
};

/**
 * Transform domain ItemWithUserState to UI ContentItem
 */
function transformToContentItem({ item, userItem }: ItemWithUserState): ContentItem {
  // Extract provider from canonicalUrl if available
  const urlLower = item.canonicalUrl?.toLowerCase() ?? '';
  let providerKey = 'substack';
  if (urlLower.includes('youtube')) providerKey = 'youtube';
  else if (urlLower.includes('spotify')) providerKey = 'spotify';
  else if (urlLower.includes('substack')) providerKey = 'substack';

  return {
    id: userItem.id, // Use userItem.id for mutation handlers
    title: item.title ?? 'Untitled',
    source: item.publisher ?? item.creator ?? 'Unknown',
    provider: providerMap[providerKey] ?? 'substack',
    type: mapContentType((item.contentType ?? 'ARTICLE') as ContentTypeEnum) as ContentType,
    thumbnailUrl: item.thumbnailUrl ?? undefined,
    duration: formatDuration(item.duration ?? undefined),
    progress: 0, // Progress tracking not implemented yet
    publishedAt: item.publishedAt ?? undefined,
  };
}

// =============================================================================
// Static Mock Data (kept for non-tRPC sections)
// =============================================================================

// Realistic mock data with actual content
const featuredContent: ContentItem = {
  id: 'featured-1',
  title: 'The Art of Calm Technology',
  subtitle: 'How to design products that respect human attention',
  source: 'Substack',
  provider: 'substack',
  type: 'article',
  gradient: ['#6366F1', '#8B5CF6'],
};

// Note: recentBookmarks removed - now using recentInbox from tRPC hooks

const podcasts: ContentItem[] = [
  {
    id: 'pod-1',
    title: "Lenny's Podcast",
    source: 'Product Deep Dives',
    provider: 'spotify',
    type: 'podcast',
    thumbnailUrl: 'https://picsum.photos/seed/lenny/400/400',
  },
  {
    id: 'pod-2',
    title: 'Lex Fridman Podcast',
    source: 'AI & Technology',
    provider: 'spotify',
    type: 'podcast',
    thumbnailUrl: 'https://picsum.photos/seed/lex/400/400',
  },
  {
    id: 'pod-3',
    title: 'How I Built This',
    source: 'NPR',
    provider: 'spotify',
    type: 'podcast',
    thumbnailUrl: 'https://picsum.photos/seed/hibt/400/400',
  },
  {
    id: 'pod-4',
    title: 'The Tim Ferriss Show',
    source: 'Lifestyle Design',
    provider: 'spotify',
    type: 'podcast',
    thumbnailUrl: 'https://picsum.photos/seed/tim/400/400',
  },
];

const videos: ContentItem[] = [
  {
    id: 'vid-1',
    title: 'The Future of React',
    source: 'Theo - t3.gg',
    provider: 'youtube',
    type: 'video',
    duration: '18:24',
    thumbnailUrl: 'https://picsum.photos/seed/theo/400/225',
  },
  {
    id: 'vid-2',
    title: 'System Design Interview',
    source: 'ByteByteGo',
    provider: 'youtube',
    type: 'video',
    duration: '32:15',
    thumbnailUrl: 'https://picsum.photos/seed/system/400/225',
  },
  {
    id: 'vid-3',
    title: 'Figma Config 2024 Keynote',
    source: 'Figma',
    provider: 'youtube',
    type: 'video',
    duration: '1:45:00',
    thumbnailUrl: 'https://picsum.photos/seed/figma/400/225',
  },
  {
    id: 'vid-4',
    title: 'The Art of Code Review',
    source: 'Fireship',
    provider: 'youtube',
    type: 'video',
    duration: '8:42',
    thumbnailUrl: 'https://picsum.photos/seed/fireship/400/225',
  },
];

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

function getContentIcon(type: ContentType, size = 16, color = '#fff') {
  switch (type) {
    case 'podcast':
      return <HeadphonesIcon size={size} color={color} />;
    case 'video':
      return <VideoIcon size={size} color={color} />;
    case 'article':
      return <ArticleIcon size={size} color={color} />;
    default:
      return <BookmarkIcon size={size} color={color} />;
  }
}

function getProviderColor(provider: Provider): string {
  return ProviderColors[provider] || '#6366F1';
}

// =============================================================================
// Components
// =============================================================================

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: React.ComponentProps<typeof Pressable>['style'];
  delay?: number;
}

function PressableScale({ children, onPress, style, delay = 0 }: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  return (
    <Animated.View entering={FadeInRight.delay(delay).duration(400)}>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[animatedStyle, style]}
      >
        {children}
      </AnimatedPressable>
    </Animated.View>
  );
}

interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  colors: typeof Colors.light;
}

function SectionHeader({ title, icon, onPress, colors }: SectionHeaderProps) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onPress}>
      <View style={styles.sectionHeaderLeft}>
        {icon}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={[styles.seeAllButton, { backgroundColor: colors.backgroundTertiary }]}>
        <Text style={[styles.seeAllText, { color: colors.textSecondary }]}>See all</Text>
        <ChevronRightIcon size={16} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

// Featured Hero Card
interface FeaturedCardProps {
  item: ContentItem;
  colors: typeof Colors.light;
}

function FeaturedCard({ item, colors }: FeaturedCardProps) {
  return (
    <Animated.View entering={FadeInDown.delay(100).duration(500)}>
      <Pressable style={styles.featuredCard}>
        <LinearGradient
          colors={item.gradient || [colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.featuredGradient}
        >
          <View style={styles.featuredContent}>
            <View style={styles.featuredBadge}>
              <SparklesIcon size={14} color="#fff" />
              <Text style={styles.featuredBadgeText}>Featured</Text>
            </View>
            <View style={styles.featuredTextContainer}>
              <Text style={styles.featuredTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.subtitle && (
                <Text style={styles.featuredSubtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              )}
            </View>
            <View style={styles.featuredFooter}>
              <View style={styles.featuredSource}>
                <ArticleIcon size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.featuredSourceText}>{item.source}</Text>
              </View>
              <View style={styles.readButton}>
                <Text style={styles.readButtonText}>Read now</Text>
              </View>
            </View>
          </View>
          {/* Decorative elements */}
          <View style={styles.featuredDecoration}>
            <View style={[styles.decorCircle, styles.decorCircle1]} />
            <View style={[styles.decorCircle, styles.decorCircle2]} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// Jump Back In Card (larger, with progress)
interface JumpBackInCardProps {
  item: ContentItem;
  colors: typeof Colors.light;
  index: number;
}

function JumpBackInCard({ item, colors, index }: JumpBackInCardProps) {
  const isVideo = item.type === 'video';
  const aspectRatio = isVideo ? 16 / 9 : 1;

  return (
    <PressableScale delay={index * 50} style={styles.jumpBackInCard}>
      <View
        style={[
          styles.jumpBackInThumbnail,
          {
            aspectRatio,
            backgroundColor: colors.backgroundTertiary,
          },
        ]}
      >
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={styles.thumbnailImage}
          contentFit="cover"
          transition={300}
        />
        {/* Play overlay */}
        <View style={styles.playOverlay}>
          <View style={styles.playButton}>
            <PlayIcon size={20} color="#fff" />
          </View>
        </View>
        {/* Duration badge */}
        {item.duration && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{item.duration}</Text>
          </View>
        )}
        {/* Progress indicator */}
        {item.progress !== undefined && (
          <View style={styles.cardProgressContainer}>
            <View style={[styles.cardProgressFill, { width: `${item.progress}%` }]} />
          </View>
        )}
      </View>
      <View style={styles.jumpBackInInfo}>
        <Text style={[styles.jumpBackInTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.jumpBackInMeta}>
          <View
            style={[styles.providerDot, { backgroundColor: getProviderColor(item.provider) }]}
          />
          <Text style={[styles.jumpBackInSource, { color: colors.textSecondary }]}>
            {item.source}
          </Text>
          {item.progress !== undefined && (
            <Text style={[styles.progressText, { color: colors.textTertiary }]}>
              {' '}
              · {item.progress}% done
            </Text>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

// Compact Content Card
interface ContentCardProps {
  item: ContentItem;
  colors: typeof Colors.light;
  index: number;
  variant?: 'default' | 'square' | 'wide';
}

function ContentCard({ item, colors, index, variant = 'default' }: ContentCardProps) {
  const isSquare = variant === 'square' || item.type === 'podcast';
  const cardWidth = variant === 'wide' ? CARD_WIDTH * 1.3 : CARD_WIDTH;
  const aspectRatio = isSquare ? 1 : 16 / 10;

  return (
    <PressableScale delay={index * 50} style={[styles.contentCard, { width: cardWidth }]}>
      <View
        style={[
          styles.contentThumbnail,
          {
            aspectRatio,
            backgroundColor: colors.backgroundTertiary,
            borderRadius: isSquare ? Radius.md : Radius.lg,
          },
        ]}
      >
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={[styles.thumbnailImage, { borderRadius: isSquare ? Radius.md : Radius.lg }]}
          contentFit="cover"
          transition={300}
        />
        {/* Type indicator */}
        <View style={styles.typeIndicator}>{getContentIcon(item.type, 14, '#fff')}</View>
        {/* Duration for videos */}
        {item.duration && item.type === 'video' && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{item.duration}</Text>
          </View>
        )}
      </View>
      <View style={styles.contentInfo}>
        <Text style={[styles.contentTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.contentSource, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.source}
        </Text>
      </View>
    </PressableScale>
  );
}

// Quick Stats Row
interface QuickStatsProps {
  colors: typeof Colors.light;
}

function QuickStats({ colors }: QuickStatsProps) {
  const stats = [
    { label: 'Saved', value: '47', icon: <BookmarkIcon size={18} color={colors.primary} /> },
    { label: 'In Progress', value: '8', icon: <PlayIcon size={18} color={ContentColors.video} /> },
    {
      label: 'This Week',
      value: '12',
      icon: <SparklesIcon size={18} color={ContentColors.podcast} />,
    },
  ];

  return (
    <Animated.View
      entering={FadeInDown.delay(200).duration(400)}
      style={[styles.quickStats, { backgroundColor: colors.backgroundSecondary }]}
    >
      {stats.map((stat) => (
        <View key={stat.label} style={styles.statItem}>
          <View style={[styles.statIcon, { backgroundColor: colors.background }]}>{stat.icon}</View>
          <View style={styles.statText}>
            <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const greeting = useMemo(() => getGreeting(), []);
  const dateStr = useMemo(() => formatDate(), []);

  // Data hooks for live data
  const bookmarkedItemsData = useBookmarkedItems();
  const inboxItemsData = useInboxItems();

  // Transform domain types to UI types
  const jumpBackIn = useMemo(
    () => bookmarkedItemsData.map(transformToContentItem),
    [bookmarkedItemsData]
  );

  const recentInbox = useMemo(() => inboxItemsData.map(transformToContentItem), [inboxItemsData]);

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{greeting}</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Your Library</Text>
            <Text style={[styles.dateText, { color: colors.textTertiary }]}>{dateStr}</Text>
          </Animated.View>

          {/* Quick Stats */}
          <QuickStats colors={colors} />

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
            {jumpBackIn.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {jumpBackIn.map((item, index) => (
                  <JumpBackInCard key={item.id} item={item} colors={colors} index={index} />
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
            {recentInbox.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContent}
              >
                {recentInbox.map((item, index) => (
                  <ContentCard key={item.id} item={item} colors={colors} index={index} />
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

          {/* Podcasts */}
          <View style={styles.section}>
            <SectionHeader
              title="Podcasts"
              icon={<HeadphonesIcon size={20} color={ContentColors.podcast} />}
              colors={colors}
            />
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
                />
              ))}
            </ScrollView>
          </View>

          {/* Videos */}
          <View style={styles.section}>
            <SectionHeader
              title="Videos"
              icon={<VideoIcon size={20} color={ContentColors.video} />}
              colors={colors}
            />
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
                />
              ))}
            </ScrollView>
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

  // Quick Stats
  quickStats: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing['2xl'],
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: {
    flex: 1,
  },
  statValue: {
    ...Typography.titleMedium,
  },
  statLabel: {
    ...Typography.labelSmall,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Sections
  section: {
    marginBottom: Spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.titleLarge,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    borderRadius: Radius.full,
    gap: 2,
  },
  seeAllText: {
    ...Typography.labelMedium,
  },

  // Horizontal scroll
  horizontalScrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },

  // Featured Card
  featuredCard: {
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  featuredGradient: {
    height: HERO_CARD_HEIGHT,
    padding: Spacing.xl,
    position: 'relative',
    overflow: 'hidden',
  },
  featuredContent: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    gap: Spacing.xs,
  },
  featuredBadgeText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },
  featuredTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  featuredTitle: {
    ...Typography.headlineMedium,
    color: '#fff',
    marginBottom: Spacing.xs,
  },
  featuredSubtitle: {
    ...Typography.bodyMedium,
    color: 'rgba(255,255,255,0.8)',
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featuredSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  featuredSourceText: {
    ...Typography.labelMedium,
    color: 'rgba(255,255,255,0.8)',
  },
  readButton: {
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  readButtonText: {
    ...Typography.labelMedium,
    color: '#6366F1',
  },
  featuredDecoration: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 200,
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  decorCircle1: {
    width: 150,
    height: 150,
    top: -30,
    right: -30,
  },
  decorCircle2: {
    width: 100,
    height: 100,
    bottom: -20,
    right: 40,
  },

  // Jump Back In Card
  jumpBackInCard: {
    width: SCREEN_WIDTH * 0.65,
  },
  jumpBackInThumbnail: {
    width: '100%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  durationText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },
  cardProgressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  cardProgressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
  },
  jumpBackInInfo: {
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },
  jumpBackInTitle: {
    ...Typography.titleMedium,
  },
  jumpBackInMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  jumpBackInSource: {
    ...Typography.bodySmall,
  },
  progressText: {
    ...Typography.bodySmall,
  },

  // Content Card
  contentCard: {
    width: CARD_WIDTH,
  },
  contentThumbnail: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  typeIndicator: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentInfo: {
    paddingTop: Spacing.md,
    gap: 2,
  },
  contentTitle: {
    ...Typography.titleSmall,
  },
  contentSource: {
    ...Typography.bodySmall,
  },

  // Badge (for future use)
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.xs,
    gap: 4,
  },
  badgeText: {
    ...Typography.labelSmall,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 40,
  },

  // Loading state
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.bodyMedium,
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
});
