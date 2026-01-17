/**
 * Item Detail Page
 *
 * Displays the full content of a saved item - Spotify podcasts, YouTube videos, articles, or posts.
 * Accessible from all item cards throughout the app (Inbox, Library, Home).
 *
 * Features:
 * - Large cover image at top
 * - Provider and type badges
 * - Title, source/creator row, and metadata
 * - Action row with icon buttons and FAB for external link
 * - Full description section
 * - Loading, error, and not found states
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  Share,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ParallaxScrollView from '@/components/ParallaxScrollView';
import {
  Colors,
  Typography,
  Spacing,
  Radius,
  ContentColors,
  ProviderColors,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useItem, useBookmarkItem, useUnbookmarkItem, UserItemState } from '@/hooks/use-items-trpc';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { getContentIcon, getProviderLabel } from '@/lib/content-utils';
import { logger } from '@/lib/logger';
import { validateItemId } from '@/lib/route-validation';

// ============================================================================
// Badge Components
// ============================================================================

function SourceBadge({ provider }: { provider: string }) {
  const providerMap: Record<string, { color: string; label: string }> = {
    YOUTUBE: { color: ProviderColors.youtube, label: 'YouTube' },
    SPOTIFY: { color: ProviderColors.spotify, label: 'Spotify' },
    SUBSTACK: { color: ProviderColors.substack, label: 'Substack' },
    X: { color: ProviderColors.x, label: 'X' },
    TWITTER: { color: ProviderColors.twitter, label: 'X' },
    WEB: { color: '#6A6A6A', label: 'Web' },
  };
  const { color, label } = providerMap[provider] ?? { color: '#6A6A6A', label: 'Web' };

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function TypeBadge({ contentType }: { contentType: string }) {
  const typeMap: Record<string, { color: string; label: string }> = {
    VIDEO: { color: ContentColors.video, label: 'Video' },
    PODCAST: { color: ContentColors.podcast, label: 'Podcast' },
    ARTICLE: { color: ContentColors.article, label: 'Article' },
    POST: { color: ContentColors.post, label: 'Post' },
  };
  const { color, label } = typeMap[contentType] ?? { color: '#6A6A6A', label: 'Content' };

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

// ============================================================================
// FAB Configuration by Provider
// ============================================================================

type FabConfig = {
  backgroundColor: string;
  providerIcon: React.ReactNode;
};

function getFabConfig(provider: string): FabConfig {
  switch (provider) {
    case 'SPOTIFY':
      return {
        providerIcon: <FontAwesome5 name="spotify" size={22} color="#FFFFFF" />,
        backgroundColor: '#1DB954',
      };
    case 'YOUTUBE':
      return {
        providerIcon: <Ionicons name="logo-youtube" size={22} color="#FFFFFF" />,
        backgroundColor: '#FF0000',
      };
    default:
      // Web, Substack, X, and other providers
      return {
        providerIcon: <Ionicons name="globe-outline" size={22} color="#FFFFFF" />,
        backgroundColor: '#1A1A1A',
      };
  }
}

// ============================================================================
// Linked Text Component (URL Detection)
// ============================================================================

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function LinkedText({
  children,
  style,
  linkColor,
}: {
  children: string;
  style?: object;
  linkColor: string;
}) {
  const parts = children.split(URL_REGEX);

  const handleLinkPress = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (err) {
      logger.error('Failed to open URL', { error: err });
    }
  };

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (URL_REGEX.test(part)) {
          // Reset regex lastIndex since we're reusing it
          URL_REGEX.lastIndex = 0;
          return (
            <Text
              key={index}
              style={{ color: linkColor, textDecorationLine: 'underline' }}
              onPress={() => handleLinkPress(part)}
            >
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

// ============================================================================
// Icon Action Button
// ============================================================================

function IconActionButton({
  icon,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.iconActionButton}>
      <Ionicons name={icon} size={24} color={color} style={{ fontWeight: '700' }} />
    </Pressable>
  );
}

// ============================================================================
// Floating Header Button
// ============================================================================

function HeaderIconButton({
  icon,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  colors: typeof Colors.dark;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.headerIconButton, { backgroundColor: colors.backgroundSecondary }]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingState({ colors }: { colors: typeof Colors.dark }) {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading item...</Text>
    </View>
  );
}

// ============================================================================
// Error State
// ============================================================================

function ErrorState({
  colors,
  message,
  onRetry,
}: {
  colors: typeof Colors.dark;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centerContainer}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={[styles.retryButton, { backgroundColor: colors.buttonPrimary }]}
        >
          <Text style={[styles.retryButtonText, { color: colors.buttonPrimaryText }]}>
            Try Again
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ============================================================================
// Not Found State
// ============================================================================

function NotFoundState({ colors }: { colors: typeof Colors.dark }) {
  const router = useRouter();

  return (
    <View style={styles.centerContainer}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Item not found</Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
        This item may have been deleted or does not exist.
      </Text>
      <Pressable
        onPress={() => router.back()}
        style={[styles.retryButton, { backgroundColor: colors.buttonPrimary }]}
      >
        <Text style={[styles.retryButtonText, { color: colors.buttonPrimaryText }]}>Go Back</Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Invalid Parameter State
// ============================================================================

function InvalidParamState({ colors, message }: { colors: typeof Colors.dark; message: string }) {
  const router = useRouter();

  return (
    <View style={styles.centerContainer}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Invalid Link</Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{message}</Text>
      <Pressable
        onPress={() => router.back()}
        style={[styles.retryButton, { backgroundColor: colors.buttonPrimary }]}
      >
        <Text style={[styles.retryButtonText, { color: colors.buttonPrimaryText }]}>Go Back</Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Validate the id parameter early
  const idValidation = validateItemId(id);

  // Fetch item data - only if id is valid
  const {
    data: item,
    isLoading,
    error,
    refetch,
  } = useItem(idValidation.success ? idValidation.data : '');

  // Mutations
  const bookmarkMutation = useBookmarkItem();
  const unbookmarkMutation = useUnbookmarkItem();

  // Render invalid param state if id is invalid
  if (!idValidation.success) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: '',
            headerShown: false,
          }}
        />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <InvalidParamState colors={colors} message={idValidation.message} />
        </SafeAreaView>
      </View>
    );
  }

  // Handle open in browser/app
  const handleOpenLink = async () => {
    if (!item?.canonicalUrl) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const supported = await Linking.canOpenURL(item.canonicalUrl);
      if (supported) {
        await Linking.openURL(item.canonicalUrl);
      }
    } catch (err) {
      logger.error('Failed to open URL', { error: err });
    }
  };

  // Handle share action
  const handleShare = async () => {
    if (!item) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await Share.share({
        title: item.title,
        url: item.canonicalUrl,
        message: `Check out "${item.title}"`,
      });
    } catch (err) {
      logger.error('Failed to share', { error: err });
    }
  };

  // Handle bookmark toggle
  const handleToggleBookmark = () => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isBookmarked = item.state === UserItemState.BOOKMARKED;
    if (isBookmarked) {
      unbookmarkMutation.mutate({ id: item.id });
    } else {
      bookmarkMutation.mutate({ id: item.id });
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <LoadingState colors={colors} />
        </SafeAreaView>
      </View>
    );
  }

  // Render error state
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ErrorState colors={colors} message={error.message} onRetry={() => refetch()} />
        </SafeAreaView>
      </View>
    );
  }

  // Render not found state
  if (!item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <NotFoundState colors={colors} />
        </SafeAreaView>
      </View>
    );
  }

  const providerLabel = getProviderLabel(item.provider);

  // Get description label based on content type
  const getDescriptionLabel = () => {
    switch (item.contentType) {
      case 'VIDEO':
        return 'About this video';
      case 'PODCAST':
        return 'About this episode';
      case 'ARTICLE':
        return 'About this article';
      case 'POST':
        return 'About this post';
      default:
        return 'Description';
    }
  };

  // Check if we have a thumbnail for parallax
  const hasThumbnail = !!item.thumbnailUrl;

  // Check if item is bookmarked
  const isBookmarked = item.state === UserItemState.BOOKMARKED;

  // Determine aspect ratio based on content type
  // Videos use 16:9, podcasts/articles use square (1:1)
  const headerAspectRatio = item.contentType === 'VIDEO' ? 16 / 9 : 1;

  // Render with parallax for items with thumbnails
  if (hasThumbnail) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />

        <Animated.View entering={FadeIn.delay(300)} style={styles.animatedContainer}>
          <ParallaxScrollView
            headerImage={
              <Image
                source={{ uri: item.thumbnailUrl! }}
                style={styles.parallaxCoverImage}
                contentFit="cover"
                transition={300}
              />
            }
            headerAspectRatio={headerAspectRatio}
          >
            {/* Content */}
            <Animated.View
              entering={FadeInDown.delay(200).duration(400)}
              style={styles.contentContainer}
            >
              {/* Badges Row */}
              <View style={styles.badgeRow}>
                <SourceBadge provider={item.provider} />
                <TypeBadge contentType={item.contentType} />
              </View>

              {/* Title */}
              <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>

              {/* Source/Creator Row */}
              <Pressable style={styles.sourceRow}>
                {item.creatorImageUrl ? (
                  <Image
                    source={{ uri: item.creatorImageUrl }}
                    style={styles.sourceThumbnail}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.sourcePlaceholder,
                      { backgroundColor: colors.backgroundTertiary },
                    ]}
                  >
                    {getContentIcon(item.contentType, 14, colors.textTertiary)}
                  </View>
                )}
                <Text style={[styles.sourceName, { color: colors.text }]}>{item.creator}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>

              {/* Meta Row */}
              <View style={styles.metaRow}>
                {providerLabel && (
                  <>
                    <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                      {providerLabel}
                    </Text>
                    <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
                  </>
                )}
                {item.publishedAt && (
                  <>
                    <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                      {formatRelativeTime(item.publishedAt)}
                    </Text>
                    <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
                  </>
                )}
                {item.duration && (
                  <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                    {formatDuration(item.duration)}
                  </Text>
                )}
                {item.readingTimeMinutes && (
                  <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                    {item.readingTimeMinutes} min read
                  </Text>
                )}
              </View>
            </Animated.View>

            {/* Icon Action Row */}
            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.actionRow}>
              <View style={styles.actionRowLeft}>
                <IconActionButton
                  icon={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  color={isBookmarked ? colors.primary : colors.textSecondary}
                  onPress={handleToggleBookmark}
                />
                <IconActionButton icon="add-circle-outline" color={colors.textSecondary} />
                <IconActionButton
                  icon="share-outline"
                  color={colors.textSecondary}
                  onPress={handleShare}
                />
                <IconActionButton icon="ellipsis-horizontal" color={colors.textSecondary} />
              </View>
              {(() => {
                const fabConfig = getFabConfig(item.provider);
                return (
                  <Pressable
                    onPress={handleOpenLink}
                    style={[styles.fabButton, { backgroundColor: fabConfig.backgroundColor }]}
                  >
                    {fabConfig.providerIcon}
                  </Pressable>
                );
              })()}
            </Animated.View>

            {/* Description */}
            {item.summary && (
              <Animated.View
                entering={FadeInDown.delay(400).duration(400)}
                style={styles.descriptionContainer}
              >
                <Text style={[styles.descriptionLabel, { color: colors.text }]}>
                  {getDescriptionLabel()}
                </Text>
                <LinkedText
                  style={[styles.description, { color: colors.textSecondary }]}
                  linkColor={colors.primary}
                >
                  {item.summary}
                </LinkedText>
              </Animated.View>
            )}
          </ParallaxScrollView>
        </Animated.View>

        {/* Floating Back Button */}
        <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Animated.View entering={FadeIn.duration(300)}>
            <HeaderIconButton icon="chevron-back" colors={colors} onPress={() => router.back()} />
          </Animated.View>
        </View>
      </View>
    );
  }

  // Fallback for items without thumbnails - use regular ScrollView
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: '', headerShown: false }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Content */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(400)}
          style={styles.contentContainer}
        >
          {/* Badges Row */}
          <View style={styles.badgeRow}>
            <SourceBadge provider={item.provider} />
            <TypeBadge contentType={item.contentType} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>

          {/* Source/Creator Row */}
          <Pressable style={styles.sourceRow}>
            {item.creatorImageUrl ? (
              <Image
                source={{ uri: item.creatorImageUrl }}
                style={styles.sourceThumbnail}
                contentFit="cover"
              />
            ) : (
              <View
                style={[styles.sourcePlaceholder, { backgroundColor: colors.backgroundTertiary }]}
              >
                {getContentIcon(item.contentType, 14, colors.textTertiary)}
              </View>
            )}
            <Text style={[styles.sourceName, { color: colors.text }]}>{item.creator}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>

          {/* Meta Row */}
          <View style={styles.metaRow}>
            {providerLabel && (
              <>
                <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                  {providerLabel}
                </Text>
                <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
              </>
            )}
            {item.publishedAt && (
              <>
                <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                  {formatRelativeTime(item.publishedAt)}
                </Text>
                <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
              </>
            )}
            {item.duration && (
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                {formatDuration(item.duration)}
              </Text>
            )}
            {item.readingTimeMinutes && (
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                {item.readingTimeMinutes} min read
              </Text>
            )}
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <View style={styles.actionRowLeft}>
              <IconActionButton
                icon={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                color={isBookmarked ? colors.primary : colors.textSecondary}
                onPress={handleToggleBookmark}
              />
              <IconActionButton icon="add-circle-outline" color={colors.textSecondary} />
              <IconActionButton
                icon="share-outline"
                color={colors.textSecondary}
                onPress={handleShare}
              />
              <IconActionButton icon="ellipsis-horizontal" color={colors.textSecondary} />
            </View>
            {(() => {
              const fabConfig = getFabConfig(item.provider);
              return (
                <Pressable
                  onPress={handleOpenLink}
                  style={[styles.fabButton, { backgroundColor: fabConfig.backgroundColor }]}
                >
                  {fabConfig.providerIcon}
                </Pressable>
              );
            })()}
          </View>

          {/* Description */}
          {item.summary && (
            <View style={styles.descriptionContainer}>
              <Text style={[styles.descriptionLabel, { color: colors.text }]}>
                {getDescriptionLabel()}
              </Text>
              <LinkedText
                style={[styles.description, { color: colors.textSecondary }]}
                linkColor={colors.primary}
              >
                {item.summary}
              </LinkedText>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* Floating Back Button */}
      <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Animated.View entering={FadeIn.duration(300)}>
          <HeaderIconButton icon="chevron-back" colors={colors} onPress={() => router.back()} />
        </Animated.View>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  animatedContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },

  // Cover Image
  parallaxCoverImage: {
    width: '100%',
    height: '100%',
  },
  coverContainer: {
    width: '100%',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Floating Header
  floatingHeader: {
    position: 'absolute',
    left: Spacing.xl,
    right: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 100,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  badgeText: {
    ...Typography.labelMedium,
    color: '#FFFFFF',
  },

  // Content
  contentContainer: {
    padding: Spacing.xl,
  },
  title: {
    ...Typography.headlineMedium,
    marginBottom: Spacing.md,
  },

  // Source Row
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  sourceThumbnail: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
  },
  sourcePlaceholder: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceName: {
    ...Typography.labelLarge,
    marginRight: Spacing.xs,
  },

  // Meta Row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: Spacing.lg,
  },
  metaText: {
    ...Typography.bodySmall,
  },
  metaDot: {
    ...Typography.bodySmall,
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingLeft: Spacing.xl,
    paddingRight: Spacing.xl + Spacing.sm,
  },
  actionRowLeft: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconActionButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Description
  descriptionContainer: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  descriptionLabel: {
    ...Typography.titleLarge,
    marginBottom: Spacing.sm,
  },
  description: {
    ...Typography.bodyMedium,
    lineHeight: 24,
  },

  // Center Container (for loading/error/not found)
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    ...Typography.bodyMedium,
    marginTop: Spacing.md,
  },
  errorTitle: {
    ...Typography.headlineSmall,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  errorMessage: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  retryButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
  },
  retryButtonText: {
    ...Typography.labelMedium,
  },
});
