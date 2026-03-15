/**
 * Unified ItemCard Component
 *
 * A flexible card component organized around three layout shapes:
 * - row: thumbnail left, content right
 * - stack: media on top, content below
 * - cover: full-bleed image with text overlay
 */

import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePrefetchItemDetail } from '@/hooks/use-prefetch';
import { formatDuration } from '@/lib/format';
import {
  getContentIcon,
  getProviderColor,
  mapContentType,
  type ContentType,
  type Provider,
} from '@/lib/content-utils';

// ============================================================================
// Types
// ============================================================================

export type ItemCardShape = 'row' | 'stack' | 'cover';
export type ItemCardRowStyle = 'compact' | 'featured';

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

  /** Layout shape: row (lists), stack (horizontal cards), cover (overlay cards) */
  shape?: ItemCardShape;

  /** Visual treatment for row cards */
  rowStyle?: ItemCardRowStyle;

  /** Optional list index for parent list ordering */
  index?: number;

  /** Custom press handler (default: navigate to detail) */
  onPress?: () => void;
}

function buildRowMetaParts(
  item: ItemCardData,
  contentTypeLabel: string,
  durationText: string | null,
  readingTimeText: string | null
) {
  const metaParts = [item.creator, contentTypeLabel];

  if (durationText) {
    metaParts.push(durationText);
  } else if (readingTimeText) {
    metaParts.push(readingTimeText);
  }

  return metaParts;
}

// ============================================================================
// Component
// ============================================================================

export function ItemCard({
  item,
  shape = 'row',
  rowStyle = 'compact',
  index: _index,
  onPress,
}: ItemCardProps) {
  const router = useRouter();
  const { colors, motion } = useAppTheme();
  const prefetchItemDetail = usePrefetchItemDetail();
  const mediaTransition = motion.duration.normal;

  const contentType = mapContentType(item.contentType);
  const contentColor = ContentColors[contentType];
  const contentTypeLabel = contentType.charAt(0).toUpperCase() + contentType.slice(1);
  const providerColor = getProviderColor(item.provider);
  const durationText = formatDuration(item.duration);
  const readingTimeText =
    item.readingTimeMinutes && !item.duration ? `${item.readingTimeMinutes} min` : null;

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    prefetchItemDetail(item.id);
    router.push(`/item/${item.id}` as Href);
  };

  if (shape === 'cover') {
    return (
      <Animated.View>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [styles.coverCard, pressed && { opacity: 0.95 }]}
        >
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={styles.coverImage}
              contentFit="cover"
              transition={mediaTransition}
            />
          ) : (
            <View style={[styles.coverImage, { backgroundColor: colors.surfaceRaised }]} />
          )}

          <View style={[styles.coverContent, { backgroundColor: colors.overlaySoft }]}>
            <Text style={[styles.coverCreator, { color: colors.overlayForegroundSubtle }]}>
              {item.creator}
            </Text>
            <Text
              style={[styles.coverTitle, { color: colors.overlayForeground }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {durationText && (
              <Text style={[styles.coverDuration, { color: colors.overlayForegroundMuted }]}>
                {durationText}
              </Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  if (shape === 'stack') {
    return (
      <Animated.View>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.stackCard,
            { backgroundColor: colors.surfaceSubtle },
            pressed && { opacity: 0.7 },
          ]}
        >
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={styles.stackImage}
              contentFit="cover"
              transition={mediaTransition}
            />
          ) : (
            <View style={[styles.stackImage, { backgroundColor: colors.surfaceRaised }]}>
              {getContentIcon(item.contentType, 32, colors.textTertiary)}
            </View>
          )}

          <View style={styles.stackContent}>
            <Text style={[styles.stackTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.stackMeta}>
              <View style={[styles.stackTypeDot, { backgroundColor: contentColor }]} />
              <Text style={[styles.stackSource, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.creator}
              </Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  const isFeaturedRow = rowStyle === 'featured';

  if (isFeaturedRow) {
    return (
      <Animated.View style={styles.rowFeaturedWrapper}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.rowFeaturedCard,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.75 },
          ]}
        >
          <View
            style={[
              styles.rowFeaturedThumbnailContainer,
              { backgroundColor: colors.backgroundTertiary },
            ]}
          >
            {item.thumbnailUrl ? (
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.rowFeaturedThumbnailImage}
                contentFit="cover"
                transition={mediaTransition}
              />
            ) : (
              getContentIcon(item.contentType, 20, colors.textTertiary)
            )}
          </View>
          <View style={styles.rowFeaturedTitleWrap}>
            <Text style={[styles.rowFeaturedTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  const metaParts = buildRowMetaParts(item, contentTypeLabel, durationText, readingTimeText);

  return (
    <Animated.View>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.rowCompactCard, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.rowCompactThumbnailContainer}>
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={styles.rowCompactThumbnailImage}
              contentFit="cover"
              transition={mediaTransition}
            />
          ) : (
            <View
              style={[styles.rowCompactThumbnailImage, { backgroundColor: colors.surfaceRaised }]}
            >
              {getContentIcon(item.contentType, 20, colors.textTertiary)}
            </View>
          )}
        </View>

        <View style={styles.rowCompactContent}>
          <Text style={[styles.rowCompactTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.rowCompactMeta}>
            <View style={[styles.rowCompactProviderDot, { backgroundColor: providerColor }]} />
            <Text
              style={[styles.rowCompactMetaText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {metaParts.join(' · ')}
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
  rowCompactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  rowCompactThumbnailContainer: {
    width: 48,
    height: 48,
    marginRight: Spacing.md,
  },
  rowCompactThumbnailImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCompactContent: {
    flex: 1,
    justifyContent: 'center',
  },
  rowCompactTitle: {
    ...Typography.bodyMedium,
    fontWeight: '500',
    marginBottom: 2,
  },
  rowCompactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowCompactProviderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
    flexShrink: 0,
  },
  rowCompactMetaText: {
    ...Typography.bodySmall,
    flex: 1,
  },

  rowFeaturedCard: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowFeaturedWrapper: {
    flexBasis: '48%',
    flexGrow: 1,
    height: 72,
  },
  rowFeaturedThumbnailContainer: {
    width: 64,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFeaturedThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  rowFeaturedTitleWrap: {
    flex: 1,
    paddingVertical: 2,
    paddingRight: Spacing.xs,
    justifyContent: 'center',
  },
  rowFeaturedTitle: {
    ...Typography.bodySmall,
    fontWeight: '600',
    // design-system-exception: preserve existing Jump Back In line-height while the 12/14 token gap is unresolved.
    lineHeight: 14,
  },

  stackCard: {
    width: 200,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  stackImage: {
    width: '100%',
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackContent: {
    padding: Spacing.md,
  },
  stackTitle: {
    ...Typography.bodyMedium,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  stackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stackSource: {
    ...Typography.bodySmall,
    flex: 1,
  },
  stackTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  coverCard: {
    width: 280,
    height: 180,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginRight: Spacing.md,
  },
  coverImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  coverContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.lg,
  },
  coverCreator: {
    ...Typography.labelSmallPlain,
    marginBottom: Spacing.xs,
  },
  coverTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  coverDuration: {
    ...Typography.bodySmall,
  },
});

export default ItemCard;
