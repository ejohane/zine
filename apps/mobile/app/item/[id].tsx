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
import { View, Text, ScrollView, StyleSheet, Pressable, Linking, Share } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SourceBadge, TypeBadge } from '@/components/badges';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import {
  LoadingState,
  ErrorState,
  NotFoundState,
  InvalidParamState,
} from '@/components/list-states';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Provider } from '@/hooks/use-items-trpc';
import {
  useItem,
  useBookmarkItem,
  useUnbookmarkItem,
  useToggleFinished,
  useMarkItemOpened,
  UserItemState,
  ContentType,
} from '@/hooks/use-items-trpc';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { useCreator } from '@/hooks/use-creator';
import {
  getContentIcon,
  upgradeSpotifyImageUrl,
  upgradeYouTubeImageUrl,
} from '@/lib/content-utils';
import { logger } from '@/lib/logger';
import { validateItemId } from '@/lib/route-validation';

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
    case 'X':
    case 'TWITTER':
      return {
        providerIcon: <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>𝕏</Text>,
        backgroundColor: '#1A1A1A',
      };
    default:
      // Web, Substack, and other providers
      return {
        providerIcon: <Ionicons name="globe-outline" size={22} color="#FFFFFF" />,
        backgroundColor: '#1A1A1A',
      };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract @handle from X/Twitter URL
 * e.g., "https://x.com/elithrar/status/123" => "elithrar"
 */
function extractXHandle(url: string): string | null {
  const match = url.match(/(?:x\.com|twitter\.com)\/([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * Extract podcast host names from description.
 * Looks for common patterns like "from X and Y", "by X and Y", "with X and Y"
 * Returns null if no pattern is found.
 */
function extractPodcastHosts(description: string | null | undefined): string | null {
  if (!description) return null;

  // Common patterns for podcast host attribution
  const patterns = [
    /(?:from|by|hosted by|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)+)/i,
    /(?:from|by|hosted by|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
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
// X Post Body Component
// ============================================================================

/**
 * X Post Bookmark View
 *
 * Renders X/Twitter posts in a Twitter-like layout:
 * - ScrollView (no parallax header image)
 * - Tweet text as title at top
 * - Profile row with avatar and name
 * - Meta row with @handle and timestamp
 * - Action row with icons + FAB
 * - Twitter-like content section with avatar + author info + full text
 */
function XPostBookmarkView({
  item,
  colors,
  insets,
  onBack,
  onOpenLink,
  onShare,
  onBookmarkToggle,
  onComplete,
  onCreatorPress,
  bookmarkActionIcon,
  bookmarkActionColor,
  isBookmarkActionDisabled,
  completeActionIcon,
  completeActionColor,
  isCompleteActionDisabled,
  creatorData,
}: {
  item: {
    id: string;
    title: string;
    creator: string;
    creatorImageUrl?: string | null;
    creatorId?: string | null;
    thumbnailUrl?: string | null;
    summary?: string | null;
    publishedAt?: string | null;
    canonicalUrl: string;
    provider: string;
  };
  colors: typeof Colors.dark;
  insets: { top: number; bottom: number };
  onBack: () => void;
  onOpenLink: () => void;
  onShare: () => void;
  onBookmarkToggle: () => void;
  onComplete: () => void;
  onCreatorPress?: () => void;
  bookmarkActionIcon: keyof typeof Ionicons.glyphMap;
  bookmarkActionColor: string;
  isBookmarkActionDisabled: boolean;
  completeActionIcon: keyof typeof Ionicons.glyphMap;
  completeActionColor: string;
  isCompleteActionDisabled: boolean;
  creatorData?: { handle?: string | null } | null;
}) {
  // Extract @handle from URL as fallback if creatorData.handle not available
  const handle = creatorData?.handle || extractXHandle(item.canonicalUrl);

  // Get FAB config for X
  const fabConfig = getFabConfig(item.provider);

  // Check if we have a thumbnail for parallax
  const hasThumbnail = !!item.thumbnailUrl;

  // Shared content sections
  const renderContent = () => (
    <>
      {/* Content Section */}
      <Animated.View style={styles.contentContainer}>
        {/* Badges Row */}
        <View style={styles.badgeRow}>
          <SourceBadge provider={item.provider as Provider} />
          <TypeBadge contentType={ContentType.POST} />
        </View>

        {/* Creator Row - same as YouTube/Spotify */}
        {item.creatorId && onCreatorPress ? (
          <Pressable
            style={styles.creatorRow}
            onPress={onCreatorPress}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.creator}'s profile`}
          >
            {item.creatorImageUrl ? (
              <Image
                source={{ uri: item.creatorImageUrl }}
                style={styles.creatorThumbnail}
                contentFit="cover"
              />
            ) : (
              <View
                style={[styles.creatorPlaceholder, { backgroundColor: colors.backgroundTertiary }]}
              >
                <Text style={[styles.creatorInitial, { color: colors.textTertiary }]}>
                  {item.creator?.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.creatorName, { color: colors.text }]}>{item.creator}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        ) : (
          <View style={styles.sourceRow}>
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
                <Ionicons name="person" size={14} color={colors.textTertiary} />
              </View>
            )}
            <Text style={[styles.sourceName, { color: colors.text }]}>{item.creator}</Text>
          </View>
        )}

        {/* Meta Row - same format as YouTube/Spotify */}
        <View style={styles.metaRow}>
          {handle && (
            <>
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>{handle}</Text>
              <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
            </>
          )}
          {item.publishedAt && (
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>
              {formatRelativeTime(item.publishedAt)}
            </Text>
          )}
        </View>
      </Animated.View>

      {/* Icon Action Row */}
      <Animated.View style={styles.actionRow}>
        <View style={styles.actionRowLeft}>
          <IconActionButton
            icon={bookmarkActionIcon}
            color={bookmarkActionColor}
            onPress={onBookmarkToggle}
            disabled={isBookmarkActionDisabled}
          />
          <IconActionButton
            icon={completeActionIcon}
            color={completeActionColor}
            onPress={onComplete}
            disabled={isCompleteActionDisabled}
          />
          <IconActionButton icon="add-circle-outline" color={colors.textSecondary} />
          <IconActionButton icon="share-outline" color={colors.textSecondary} onPress={onShare} />
          <IconActionButton icon="ellipsis-horizontal" color={colors.textSecondary} />
        </View>
        <Pressable
          onPress={onOpenLink}
          style={[styles.fabButton, { backgroundColor: fabConfig.backgroundColor }]}
        >
          {fabConfig.providerIcon}
        </Pressable>
      </Animated.View>

      {/* Tweet Content Section - Twitter-like layout */}
      <Animated.View style={xPostStyles.tweetContentSection}>
        <View style={xPostStyles.tweetRow}>
          {/* Avatar on the left */}
          {item.creatorImageUrl ? (
            <Image
              source={{ uri: item.creatorImageUrl }}
              style={xPostStyles.tweetAvatar}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                xPostStyles.tweetAvatar,
                {
                  backgroundColor: colors.backgroundTertiary,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Ionicons name="person" size={24} color={colors.textTertiary} />
            </View>
          )}

          {/* Content on the right */}
          <View style={xPostStyles.tweetContentRight}>
            {/* Name, handle, timestamp row */}
            <View style={xPostStyles.tweetAuthorRow}>
              <Text style={[xPostStyles.tweetAuthorName, { color: colors.text }]} numberOfLines={1}>
                {item.creator}
              </Text>
              {handle && (
                <Text
                  style={[xPostStyles.tweetAuthorHandle, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  @{handle}
                </Text>
              )}
              {item.publishedAt && (
                <Text style={[xPostStyles.tweetTimestamp, { color: colors.textTertiary }]}>
                  · {formatRelativeTime(item.publishedAt)}
                </Text>
              )}
            </View>

            {/* Tweet text with link detection */}
            <LinkedText
              style={[xPostStyles.postText, { color: colors.text }]}
              linkColor={colors.primary}
            >
              {item.title}
            </LinkedText>

            {/* Additional content from summary if different from title */}
            {item.summary && item.summary !== item.title && (
              <LinkedText
                style={[xPostStyles.postText, { color: colors.text, marginTop: Spacing.sm }]}
                linkColor={colors.primary}
              >
                {item.summary}
              </LinkedText>
            )}
          </View>
        </View>
      </Animated.View>
    </>
  );

  // Render with parallax for X posts with thumbnails
  if (hasThumbnail) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />

        <Animated.View style={styles.animatedContainer}>
          <ParallaxScrollView
            headerImage={
              <Image
                source={{ uri: item.thumbnailUrl! }}
                style={styles.parallaxCoverImage}
                contentFit="cover"
                transition={300}
              />
            }
            headerAspectRatio={16 / 9}
          >
            {renderContent()}
          </ParallaxScrollView>
        </Animated.View>

        {/* Floating Back Button */}
        <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Animated.View>
            <HeaderIconButton icon="chevron-back" colors={colors} onPress={onBack} />
          </Animated.View>
        </View>
      </View>
    );
  }

  // Fallback for X posts without thumbnails - use regular ScrollView
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: '', headerShown: false }} />

      <Animated.View style={styles.animatedContainer}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 }]}
          showsVerticalScrollIndicator={false}
        >
          {renderContent()}
        </ScrollView>
      </Animated.View>

      {/* Floating Back Button */}
      <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Animated.View>
          <HeaderIconButton icon="chevron-back" colors={colors} onPress={onBack} />
        </Animated.View>
      </View>
    </View>
  );
}

// ============================================================================
// Icon Action Button
// ============================================================================

function IconActionButton({
  icon,
  color,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[styles.iconActionButton, disabled ? { opacity: 0.5 } : null]}
    >
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
  const toggleFinishedMutation = useToggleFinished();
  const markOpenedMutation = useMarkItemOpened();

  // Fetch creator data for description (when creatorId is available)
  const { creator: creatorData } = useCreator(item?.creatorId ?? '');

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
          <InvalidParamState message={idValidation.message} />
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
        if (item.state === UserItemState.BOOKMARKED) {
          markOpenedMutation.mutate({ id: item.id });
        }
      }
    } catch (err) {
      logger.error('Failed to open URL', { error: err });
    }
  };

  // Handle share action
  const handleShare = async () => {
    if (!item) return;

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

  const handleToggleBookmark = () => {
    if (!item) return;
    if (item.state === UserItemState.BOOKMARKED) {
      unbookmarkMutation.mutate({ id: item.id });
    } else {
      bookmarkMutation.mutate({ id: item.id });
    }
  };

  const handleToggleFinished = () => {
    if (!item) return;
    if (item.state !== UserItemState.BOOKMARKED) return;
    toggleFinishedMutation.mutate({ id: item.id });
  };

  // Render loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <LoadingState message="Loading item..." />
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
          <ErrorState message={error.message} onRetry={() => refetch()} />
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
          <NotFoundState
            title="Item not found"
            message="This item may have been deleted or does not exist."
          />
        </SafeAreaView>
      </View>
    );
  }

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
  const isBookmarkActionDisabled = isBookmarked
    ? unbookmarkMutation.isPending
    : bookmarkMutation.isPending;
  const isFinished = item.isFinished;
  const bookmarkActionIcon: keyof typeof Ionicons.glyphMap = isBookmarked
    ? 'bookmark'
    : 'bookmark-outline';
  const bookmarkActionColor = isBookmarked ? colors.primary : colors.textSecondary;
  const completeActionIcon: keyof typeof Ionicons.glyphMap = isFinished
    ? 'checkmark-circle'
    : 'checkmark-circle-outline';
  const completeActionColor = isBookmarked && isFinished ? colors.success : colors.textSecondary;
  const isCompleteActionDisabled = !isBookmarked || toggleFinishedMutation.isPending;

  // Check if this is an X post - affects title and description rendering
  const isXPost = item.provider === 'X' && item.contentType === 'POST';

  // Determine aspect ratio based on content type
  // Videos use 16:9, podcasts/articles use square (1:1)
  const headerAspectRatio = item.contentType === 'VIDEO' ? 16 / 9 : 1;

  // Render X Post view for X/Twitter posts
  if (isXPost) {
    return (
      <XPostBookmarkView
        item={item}
        colors={colors}
        insets={insets}
        onBack={() => router.back()}
        onOpenLink={handleOpenLink}
        onShare={handleShare}
        onBookmarkToggle={handleToggleBookmark}
        onComplete={handleToggleFinished}
        onCreatorPress={
          item.creatorId ? () => router.push(`/creator/${item.creatorId}`) : undefined
        }
        bookmarkActionIcon={bookmarkActionIcon}
        bookmarkActionColor={bookmarkActionColor}
        isBookmarkActionDisabled={isBookmarkActionDisabled}
        completeActionIcon={completeActionIcon}
        completeActionColor={completeActionColor}
        isCompleteActionDisabled={isCompleteActionDisabled}
        creatorData={creatorData}
      />
    );
  }

  // Render with parallax for items with thumbnails
  if (hasThumbnail) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />

        <Animated.View style={styles.animatedContainer}>
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
            <Animated.View style={styles.contentContainer}>
              {/* Badges Row */}
              <View style={styles.badgeRow}>
                <SourceBadge provider={item.provider} />
                <TypeBadge contentType={item.contentType} />
              </View>

              {/* Title */}
              <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>

              {/* Source/Creator Row */}
              {item.creatorId ? (
                <Pressable
                  style={styles.creatorRow}
                  onPress={() => router.push(`/creator/${item.creatorId}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${item.creator}'s profile`}
                >
                  {item.creatorImageUrl ? (
                    <Image
                      source={{
                        uri:
                          upgradeSpotifyImageUrl(upgradeYouTubeImageUrl(item.creatorImageUrl)) ??
                          undefined,
                      }}
                      style={styles.creatorThumbnail}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={[
                        styles.creatorPlaceholder,
                        { backgroundColor: colors.backgroundTertiary },
                      ]}
                    >
                      <Text style={[styles.creatorInitial, { color: colors.textTertiary }]}>
                        {item.creator?.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.creatorName, { color: colors.text }]}>{item.creator}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ) : (
                <View style={styles.sourceRow}>
                  {item.creatorImageUrl ? (
                    <Image
                      source={{
                        uri:
                          upgradeSpotifyImageUrl(upgradeYouTubeImageUrl(item.creatorImageUrl)) ??
                          undefined,
                      }}
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
                </View>
              )}

              {/* Meta Row */}
              <View style={styles.metaRow}>
                {/* First part: Creator names (Spotify) or @handle (YouTube/X) */}
                {item.provider === 'SPOTIFY' && extractPodcastHosts(creatorData?.description) && (
                  <>
                    <Text
                      style={[styles.metaText, { color: colors.textTertiary }]}
                      numberOfLines={1}
                    >
                      {extractPodcastHosts(creatorData?.description)}
                    </Text>
                    <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
                  </>
                )}
                {(item.provider === 'YOUTUBE' || item.provider === 'X') && creatorData?.handle && (
                  <>
                    <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                      {creatorData.handle}
                    </Text>
                    <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
                  </>
                )}
                {item.publishedAt && (
                  <>
                    <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                      {formatRelativeTime(item.publishedAt)}
                    </Text>
                    {(item.duration || item.readingTimeMinutes) && (
                      <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
                    )}
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
            <Animated.View style={styles.actionRow}>
              <View style={styles.actionRowLeft}>
                <IconActionButton
                  icon={bookmarkActionIcon}
                  color={bookmarkActionColor}
                  onPress={handleToggleBookmark}
                  disabled={isBookmarkActionDisabled}
                />
                <IconActionButton
                  icon={completeActionIcon}
                  color={completeActionColor}
                  onPress={handleToggleFinished}
                  disabled={isCompleteActionDisabled}
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
              <Animated.View style={styles.descriptionContainer}>
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
          <Animated.View>
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
        <Animated.View style={styles.contentContainer}>
          {/* Badges Row */}
          <View style={styles.badgeRow}>
            <SourceBadge provider={item.provider} />
            <TypeBadge contentType={item.contentType} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>

          {/* Source/Creator Row */}
          {item.creatorId ? (
            <Pressable
              style={styles.creatorRow}
              onPress={() => router.push(`/creator/${item.creatorId}`)}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.creator}'s profile`}
            >
              {item.creatorImageUrl ? (
                <Image
                  source={{ uri: item.creatorImageUrl }}
                  style={styles.creatorThumbnail}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.creatorPlaceholder,
                    { backgroundColor: colors.backgroundTertiary },
                  ]}
                >
                  <Text style={[styles.creatorInitial, { color: colors.textTertiary }]}>
                    {item.creator?.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={[styles.creatorName, { color: colors.text }]}>{item.creator}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          ) : (
            <View style={styles.sourceRow}>
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
            </View>
          )}

          {/* Meta Row */}
          <View style={styles.metaRow}>
            {/* First part: Creator names (Spotify) or @handle (YouTube/X) */}
            {item.provider === 'SPOTIFY' && extractPodcastHosts(creatorData?.description) && (
              <>
                <Text style={[styles.metaText, { color: colors.textTertiary }]} numberOfLines={1}>
                  {extractPodcastHosts(creatorData?.description)}
                </Text>
                <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
              </>
            )}
            {(item.provider === 'YOUTUBE' || item.provider === 'X') && creatorData?.handle && (
              <>
                <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                  {creatorData.handle}
                </Text>
                <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
              </>
            )}
            {item.publishedAt && (
              <>
                <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                  {formatRelativeTime(item.publishedAt)}
                </Text>
                {(item.duration || item.readingTimeMinutes) && (
                  <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
                )}
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
                icon={bookmarkActionIcon}
                color={bookmarkActionColor}
                onPress={handleToggleBookmark}
                disabled={isBookmarkActionDisabled}
              />
              <IconActionButton
                icon={completeActionIcon}
                color={completeActionColor}
                onPress={handleToggleFinished}
                disabled={isCompleteActionDisabled}
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
        <Animated.View>
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

  // Badges Row
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
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

  // Clickable Creator Row (when creatorId exists)
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  creatorThumbnail: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
  },
  creatorPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorInitial: {
    ...Typography.bodySmall,
    fontWeight: '600',
  },
  creatorName: {
    ...Typography.labelLarge,
    fontWeight: '500',
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
});

// ============================================================================
// X Post Styles
// ============================================================================

const xPostStyles = StyleSheet.create({
  // Tweet content section - Twitter-like layout
  tweetContentSection: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  tweetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tweetAvatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    marginRight: Spacing.md,
  },
  tweetContentRight: {
    flex: 1,
  },
  tweetAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    flexWrap: 'wrap',
  },
  tweetAuthorName: {
    ...Typography.labelLarge,
    marginRight: Spacing.xs,
  },
  tweetAuthorHandle: {
    ...Typography.bodyMedium,
    marginRight: Spacing.xs,
  },
  tweetTimestamp: {
    ...Typography.bodyMedium,
  },
  postText: {
    ...Typography.bodyLarge,
    lineHeight: 26,
  },
});
