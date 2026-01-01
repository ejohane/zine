/**
 * Unified ItemCard Component
 *
 * A flexible card component that displays item content in various layouts.
 * Supports three variants: compact (library), full (inbox), and large (home featured).
 *
 * Features:
 * - Adaptive thumbnail aspect ratios (1:1 for podcasts, 16:9 for videos)
 * - Content type indicators with color coding
 * - Duration badges for video/podcast content
 * - Provider color dots for source identification
 * - Optional action buttons (bookmark, archive)
 * - Built-in navigation to item detail
 * - Entry animations with stagger support
 */

import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Colors, Typography, Spacing, Radius, Shadows, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import {
  getContentIcon,
  getProviderColor,
  getContentAspectRatio,
  isSquareContent,
  mapContentType,
  type ContentType,
  type Provider,
} from '@/lib/content-utils';
import { ArchiveIcon, BookmarkIcon, CheckIcon } from '@/components/icons';

// ============================================================================
// Types
// ============================================================================

/**
 * Visual variant of the card
 */
export type ItemCardVariant = 'compact' | 'full' | 'large';

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

  /** Visual variant: compact (library), full (inbox), large (home) */
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

  /** Animation delay index for staggered entry */
  index?: number;

  /** Custom press handler (default: navigate to detail) */
  onPress?: () => void;
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
  index = 0,
  onPress,
}: ItemCardProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Map API types to UI types
  const contentType = mapContentType(item.contentType);
  const contentColor = ContentColors[contentType];
  const providerColor = getProviderColor(item.provider);

  // Calculate aspect ratio based on content type
  const isSquare = isSquareContent(item.contentType);
  const aspectRatio = getContentAspectRatio(item.contentType);

  // Handle press - navigate to detail by default
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Navigate to item detail page (route: /item/[id])
      // Type assertion needed until the route is created
      router.push(`/item/${item.id}` as any);
    }
  };

  // Handle action button press with event stopping
  const handleActionPress = (action: () => void) => (event: any) => {
    event?.stopPropagation?.();
    action();
  };

  // Format metadata
  const durationText = formatDuration(item.duration);
  const timeText = formatRelativeTime(item.bookmarkedAt ?? item.publishedAt);

  // Render based on variant
  if (variant === 'compact') {
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.compactCard,
            { backgroundColor: colors.card, borderColor: colors.borderLight },
            pressed && { opacity: 0.95 },
          ]}
        >
          {/* Thumbnail */}
          <View style={[styles.compactThumbnail, { aspectRatio: isSquare ? 1 : 16 / 9 }]}>
            {item.thumbnailUrl ? (
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.thumbnailImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.thumbnailImage, { backgroundColor: colors.backgroundTertiary }]}>
                {getContentIcon(item.contentType, 24, colors.textTertiary)}
              </View>
            )}
            {/* Type indicator */}
            <View style={[styles.typeIndicator, { backgroundColor: contentColor }]}>
              {getContentIcon(item.contentType, 12, '#fff')}
            </View>
            {/* Duration badge */}
            {durationText && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{durationText}</Text>
              </View>
            )}
            {/* Completed badge */}
            {item.isFinished && (
              <View style={[styles.completedBadge, { backgroundColor: colors.success }]}>
                <CheckIcon size={12} color="#fff" />
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.compactContent}>
            <Text style={[styles.compactTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.compactMeta}>
              <View style={[styles.providerDot, { backgroundColor: providerColor }]} />
              <Text
                style={[styles.compactSource, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {item.creator}
              </Text>
              {timeText && (
                <Text style={[styles.compactTime, { color: colors.textTertiary }]}>
                  {' '}
                  · {timeText}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  if (variant === 'full') {
    return (
      <Animated.View
        entering={FadeInDown.delay(index * 50).duration(300)}
        style={styles.fullWrapper}
      >
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
            <Text style={[styles.fullCreator, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.creator}
            </Text>
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

  // Large variant (for home "Jump Back In" section)
  return (
    <Animated.View entering={FadeInDown.delay(index * 100).duration(400)}>
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
  // Compact variant (library)
  compactCard: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  compactThumbnail: {
    width: 100,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactContent: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  compactTitle: {
    ...Typography.titleSmall,
    marginBottom: Spacing.xs,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactSource: {
    ...Typography.bodySmall,
    flex: 1,
  },
  compactTime: {
    ...Typography.bodySmall,
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
  fullActions: {
    flexDirection: 'row',
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.sm,
    justifyContent: 'flex-end',
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
    flex: 1,
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
