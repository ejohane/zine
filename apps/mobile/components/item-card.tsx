/**
 * Unified ItemCard Component
 *
 * A flexible card component that displays item content in various layouts.
 * Supports variants for compact lists, full cards, grids, and large featured layouts.
 *
 * Features:
 * - Adaptive thumbnail aspect ratios (1:1 for podcasts, 16:9 for videos)
 * - Content type indicators with color coding
 * - Duration badges for video/podcast content
 * - Provider color dots for source identification
 * - Optional action buttons (bookmark, archive)
 * - Built-in navigation to item detail
 */

import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  type GestureResponderEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { Colors, Typography, Spacing, Radius, Shadows, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePrefetchItemDetail } from '@/hooks/use-prefetch';
import { formatDuration } from '@/lib/format';
import {
  getContentIcon,
  getProviderColor,
  getProviderLabel,
  getContentAspectRatio,
  mapContentType,
  type ContentType,
  type Provider,
} from '@/lib/content-utils';
import { ArchiveIcon, BookmarkIcon } from '@/components/icons';

// ============================================================================
// Types
// ============================================================================

/**
 * Visual variant of the card
 */
export type ItemCardVariant = 'compact' | 'full' | 'large' | 'horizontal' | 'grid';

/**
 * Item data required for the card
 */
export interface ItemCardData {
  id: string;
  title: string;
  creator: string;
  thumbnailUrl: string | null;
  contentType: ContentType;
  provider: Provider;
  duration?: number | null;
  readingTimeMinutes?: number | null;
  bookmarkedAt?: string | null;
  publishedAt?: string | null;
  isFinished?: boolean;
}

/**
 * Props for the ItemCard component
 */
export interface ItemCardProps {
  /** The item data to display */
  item: ItemCardData;

  /** Visual variant: compact (library), full (inbox), grid (home), large (home) */
  variant?: ItemCardVariant;

  /** Whether to show inline action buttons */
  showActions?: boolean;

  /** Callback when bookmark action is pressed */
  onBookmark?: () => void;

  /** Callback when archive action is pressed */
  onArchive?: () => void;

  /** Whether bookmark mutation is pending */
  isBookmarking?: boolean;

  /** Whether archive mutation is pending */
  isArchiving?: boolean;

  /** Optional list index for parent list ordering */
  index?: number;

  /** Custom press handler (default: navigate to detail) */
  onPress?: () => void;

  /** Show overlay styling on large variant (text over image) */
  overlay?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ItemCard({
  item,
  variant = 'compact',
  showActions = false,
  onBookmark,
  onArchive,
  isBookmarking = false,
  isArchiving = false,
  onPress,
  overlay = false,
}: ItemCardProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const prefetchItemDetail = usePrefetchItemDetail();

  // Map API types to UI types
  const contentType = mapContentType(item.contentType);
  const contentColor = ContentColors[contentType];
  const providerColor = getProviderColor(item.provider);
  const providerLabel = getProviderLabel(item.provider);

  // Calculate aspect ratio based on content type
  const aspectRatio = getContentAspectRatio(item.contentType);

  // Reading time for articles (only show when no duration - duration takes precedence for video/podcast)
  const readingTimeText =
    item.readingTimeMinutes && !item.duration ? `${item.readingTimeMinutes} min` : null;

  // Handle press - navigate to detail by default
  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    prefetchItemDetail(item.id);

    // Navigate to item detail page (route: /item/[id])
    // Type assertion needed until the route is created
    router.push(`/item/${item.id}` as Href);
  };

  // Handle action button press with event stopping
  const handleActionPress = (action: () => void) => (event: GestureResponderEvent) => {
    event?.stopPropagation?.();
    action();
  };

  // Format metadata
  const durationText = formatDuration(item.duration);

  // Render based on variant
  if (variant === 'compact') {
    // Build metadata parts
    const contentTypeLabel = contentType.charAt(0).toUpperCase() + contentType.slice(1);
    const metaParts = [item.creator, contentTypeLabel];
    if (durationText) {
      metaParts.push(durationText);
    } else if (readingTimeText) {
      metaParts.push(readingTimeText);
    }

    return (
      <Animated.View>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [styles.compactRow, pressed && { opacity: 0.7 }]}
        >
          {/* Thumbnail */}
          <View style={styles.compactThumbnailContainer}>
            {item.thumbnailUrl ? (
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.compactThumbnailImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View
                style={[
                  styles.compactThumbnailImage,
                  { backgroundColor: colors.backgroundTertiary },
                ]}
              >
                {getContentIcon(item.contentType, 20, colors.textTertiary)}
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.compactContent}>
            <Text style={[styles.compactTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.compactMetaRow}>
              <View style={[styles.compactProviderDot, { backgroundColor: providerColor }]} />
              <Text style={[styles.compactMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                {metaParts.join(' · ')}
              </Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  if (variant === 'grid') {
    return (
      <Animated.View>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.gridCard,
            { backgroundColor: colors.backgroundSecondary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={[styles.gridThumbnailContainer, { aspectRatio }]}>
            {item.thumbnailUrl ? (
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.gridThumbnail}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View
                style={[
                  styles.gridThumbnailPlaceholder,
                  { backgroundColor: colors.backgroundTertiary },
                ]}
              >
                {getContentIcon(item.contentType, 28, colors.textTertiary)}
              </View>
            )}
          </View>
          <View style={styles.gridContent}>
            <Text style={[styles.gridTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  if (variant === 'full') {
    return (
      <Animated.View style={styles.fullWrapper}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.fullCard,
            { backgroundColor: colors.card },
            Shadows.md,
            pressed && { opacity: 0.95 },
          ]}
        >
          {/* Thumbnail */}
          <View style={styles.fullThumbnailContainer}>
            {item.thumbnailUrl ? (
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.fullThumbnail}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View
                style={[
                  styles.fullThumbnailPlaceholder,
                  { backgroundColor: colors.backgroundTertiary },
                ]}
              >
                {getContentIcon(item.contentType, 48, colors.textTertiary)}
              </View>
            )}
            {/* Duration badge */}
            {durationText && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{durationText}</Text>
              </View>
            )}
            {/* Reading time badge (for articles without duration) */}
            {readingTimeText && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{readingTimeText}</Text>
              </View>
            )}
            {/* Content type badge */}
            <View style={[styles.typeBadge, { backgroundColor: contentColor }]}>
              <Text style={styles.typeText}>{contentType}</Text>
            </View>
          </View>

          {/* Content */}
          <View style={styles.fullContent}>
            <Text style={[styles.fullTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.fullMeta}>
              <Text style={[styles.fullCreator, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.creator}
              </Text>
              {providerLabel && (
                <Text style={[styles.fullProvider, { color: colors.textTertiary }]}>
                  {' '}
                  on {providerLabel}
                </Text>
              )}
            </View>
          </View>

          {/* Actions */}
          {showActions && (
            <View style={styles.fullActions}>
              <Pressable
                onPress={handleActionPress(onArchive || (() => {}))}
                disabled={isArchiving}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.archiveButton,
                  { backgroundColor: colors.backgroundTertiary },
                  pressed && { opacity: 0.8 },
                ]}
              >
                {isArchiving ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <ArchiveIcon size={18} color={colors.textSecondary} />
                )}
              </Pressable>
              <Pressable
                onPress={handleActionPress(onBookmark || (() => {}))}
                disabled={isBookmarking}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.bookmarkButton,
                  { backgroundColor: colors.primary },
                  pressed && { opacity: 0.8 },
                ]}
              >
                {isBookmarking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <BookmarkIcon size={18} color="#fff" />
                )}
              </Pressable>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  }

  // Horizontal variant (for home "Recently Bookmarked" and "Videos" sections)
  if (variant === 'horizontal') {
    return (
      <Animated.View>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.horizontalCard,
            { backgroundColor: colors.backgroundSecondary },
            pressed && { opacity: 0.7 },
          ]}
        >
          {/* Thumbnail */}
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={styles.horizontalCardImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View
              style={[styles.horizontalCardImage, { backgroundColor: colors.backgroundTertiary }]}
            >
              {getContentIcon(item.contentType, 32, colors.textTertiary)}
            </View>
          )}

          {/* Content */}
          <View style={styles.horizontalCardContent}>
            <Text style={[styles.horizontalCardTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.horizontalCardMeta}>
              <View style={[styles.horizontalTypeDot, { backgroundColor: contentColor }]} />
              <Text
                style={[styles.horizontalCardSource, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {item.creator}
              </Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // Large variant with overlay (for home "Podcasts" section with text over image)
  if (variant === 'large' && overlay) {
    return (
      <Animated.View>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [styles.largeOverlayCard, pressed && { opacity: 0.95 }]}
        >
          {/* Background Image */}
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={styles.largeOverlayImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View
              style={[styles.largeOverlayImage, { backgroundColor: colors.backgroundTertiary }]}
            />
          )}

          {/* Overlay Content */}
          <View style={styles.largeOverlayContent}>
            <Text style={styles.largeOverlaySource}>{item.creator}</Text>
            <Text style={styles.largeOverlayTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {durationText && <Text style={styles.largeOverlayDuration}>{durationText}</Text>}
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // Large variant (for home "Jump Back In" section)
  return (
    <Animated.View>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.largeCard,
          { backgroundColor: colors.card },
          Shadows.lg,
          pressed && { opacity: 0.95 },
        ]}
      >
        {/* Thumbnail */}
        <View style={[styles.largeThumbnailContainer, { aspectRatio }]}>
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={styles.largeThumbnail}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View
              style={[
                styles.largeThumbnailPlaceholder,
                { backgroundColor: colors.backgroundTertiary },
              ]}
            >
              {getContentIcon(item.contentType, 64, colors.textTertiary)}
            </View>
          )}
          {/* Duration badge */}
          {durationText && (
            <View style={styles.largeDurationBadge}>
              <Text style={styles.largeDurationText}>{durationText}</Text>
            </View>
          )}
          {/* Reading time badge (for articles without duration) */}
          {readingTimeText && (
            <View style={styles.largeDurationBadge}>
              <Text style={styles.largeDurationText}>{readingTimeText}</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.largeContent}>
          <Text style={[styles.largeTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.largeMeta}>
            <View style={[styles.providerDot, { backgroundColor: providerColor }]} />
            <Text style={[styles.largeCreator, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.creator}
            </Text>
            {providerLabel && (
              <Text style={[styles.largeProvider, { color: colors.textTertiary }]}>
                {' '}
                on {providerLabel}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // Compact variant (library) - simple list row
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  compactThumbnailContainer: {
    width: 48,
    height: 48,
    marginRight: Spacing.md,
  },
  compactThumbnailImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactContent: {
    flex: 1,
    justifyContent: 'center',
  },
  compactTitle: {
    ...Typography.bodyMedium,
    fontWeight: '500',
    marginBottom: 2,
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactProviderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
    flexShrink: 0,
  },
  compactMeta: {
    ...Typography.bodySmall,
    flex: 1,
  },

  // Full variant (inbox)
  fullWrapper: {
    marginBottom: Spacing.md,
  },
  fullCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  fullThumbnailContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
  },
  fullThumbnail: {
    width: '100%',
    height: '100%',
  },
  fullThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullContent: {
    padding: Spacing.md,
  },
  fullTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  fullCreator: {
    ...Typography.bodyMedium,
  },
  fullMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  fullProvider: {
    ...Typography.bodyMedium,
  },
  fullActions: {
    flexDirection: 'row',
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.sm,
    justifyContent: 'flex-end',
  },

  // Grid variant (home "Jump Back In")
  gridCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    flexBasis: '48%',
    flexGrow: 1,
  },
  gridThumbnailContainer: {
    width: '100%',
  },
  gridThumbnail: {
    width: '100%',
    height: '100%',
  },
  gridThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridContent: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  gridTitle: {
    ...Typography.bodySmall,
    fontWeight: '600',
  },

  // Large variant (home)
  largeCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginRight: Spacing.md,
    width: 280,
  },
  largeThumbnailContainer: {
    width: '100%',
    position: 'relative',
  },
  largeThumbnail: {
    width: '100%',
    height: '100%',
  },
  largeThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeContent: {
    padding: Spacing.md,
  },
  largeTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  largeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  largeCreator: {
    ...Typography.bodyMedium,
  },
  largeProvider: {
    ...Typography.bodyMedium,
  },
  largeDurationBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  largeDurationText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Large variant with overlay (text over image)
  largeOverlayCard: {
    width: 280,
    height: 180,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginRight: Spacing.md,
  },
  largeOverlayImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  largeOverlayContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  largeOverlaySource: {
    ...Typography.labelSmall,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: Spacing.xs,
  },
  largeOverlayTitle: {
    ...Typography.titleMedium,
    color: '#FFFFFF',
    marginBottom: Spacing.xs,
  },
  largeOverlayDuration: {
    ...Typography.bodySmall,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Horizontal variant (home horizontal lists)
  horizontalCard: {
    width: 200,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  horizontalCardImage: {
    width: '100%',
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
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
  horizontalTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Shared elements
  thumbnailImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIndicator: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  typeBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  typeText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'capitalize',
  },
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  durationText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },
  providerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
  },

  // Action buttons
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveButton: {},
  bookmarkButton: {},
});

export default ItemCard;
