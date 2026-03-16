/**
 * Unified ItemCard Component
 *
 * A flexible card component organized around three layout shapes:
 * - row: thumbnail left, content right
 * - stack: media on top, content below
 * - cover: full-bleed image with text overlay
 */

import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { Typography, Spacing, Radius, ContentColors, IconSizes } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePrefetchItemDetail } from '@/hooks/use-prefetch';
import { formatDuration } from '@/lib/format';
import {
  getContentIcon,
  mapContentType,
  upgradeSpotifyImageUrl,
  upgradeYouTubeImageUrl,
  type ContentType,
  type Provider,
} from '@/lib/content-utils';

const STACK_IMAGE_HEIGHT = 112;
const STACK_TITLE_HEIGHT = Typography.bodyMedium.lineHeight;
const STACK_CARD_HEIGHT =
  STACK_IMAGE_HEIGHT +
  Spacing.md * 2 +
  STACK_TITLE_HEIGHT +
  Spacing.xs +
  Typography.bodySmall.lineHeight;

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
  creatorImageUrl?: string | null;
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
  const [showInlineTitleLength, setShowInlineTitleLength] = useState(false);
  const [subtitleAvatarFailed, setSubtitleAvatarFailed] = useState(false);

  const contentType = mapContentType(item.contentType);
  const contentColor = ContentColors[contentType];
  const durationText = formatDuration(item.duration);
  const readingTimeText =
    item.readingTimeMinutes && !item.duration ? `${item.readingTimeMinutes} min` : null;
  const inlineLengthText = durationText ?? readingTimeText;
  const creatorImageUrl =
    upgradeSpotifyImageUrl(upgradeYouTubeImageUrl(item.creatorImageUrl ?? null)) ?? null;

  useEffect(() => {
    setShowInlineTitleLength(false);
  }, [item.id, inlineLengthText, rowStyle, shape]);

  useEffect(() => {
    setSubtitleAvatarFailed(false);
  }, [item.id, creatorImageUrl]);

  const renderSubtitleLeadingVisual = () => {
    if (creatorImageUrl && !subtitleAvatarFailed) {
      return (
        <Image
          source={{ uri: creatorImageUrl }}
          style={styles.subtitleAvatar}
          contentFit="cover"
          transition={mediaTransition}
          onError={() => setSubtitleAvatarFailed(true)}
        />
      );
    }

    return getContentIcon(item.contentType, IconSizes.xs, colors.textSecondary);
  };

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
            {inlineLengthText ? (
              <View style={styles.inlineTitleMeasurement} pointerEvents="none" accessible={false}>
                <Text
                  style={[styles.stackTitle, { color: colors.text }]}
                  onTextLayout={(event) => {
                    const fitsOnOneLine = event.nativeEvent.lines.length <= 1;
                    setShowInlineTitleLength((current) =>
                      current === fitsOnOneLine ? current : fitsOnOneLine
                    );
                  }}
                >
                  {item.title}
                  <Text style={[styles.inlineTitleLength, { color: colors.textSecondary }]}>
                    {` · ${inlineLengthText}`}
                  </Text>
                </Text>
              </View>
            ) : null}
            <Text style={[styles.stackTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title}
              {showInlineTitleLength && inlineLengthText ? (
                <Text style={[styles.inlineTitleLength, { color: colors.textSecondary }]}>
                  {` · ${inlineLengthText}`}
                </Text>
              ) : null}
            </Text>
            <View style={styles.stackMeta}>
              <View style={styles.stackMetaIcon}>{renderSubtitleLeadingVisual()}</View>
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
            { backgroundColor: colors.surfaceElevated, borderColor: colors.borderDefault },
            pressed && { opacity: motion.opacity.pressed },
          ]}
        >
          <View
            style={[
              styles.rowFeaturedThumbnailContainer,
              { backgroundColor: colors.surfaceRaised },
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
          <View style={styles.rowFeaturedContent}>
            <Text style={[styles.rowFeaturedTitle, { color: colors.text }]} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

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
          {inlineLengthText ? (
            <View style={styles.inlineTitleMeasurement} pointerEvents="none" accessible={false}>
              <Text
                style={[styles.rowCompactTitle, { color: colors.text }]}
                onTextLayout={(event) => {
                  const fitsOnOneLine = event.nativeEvent.lines.length <= 1;
                  setShowInlineTitleLength((current) =>
                    current === fitsOnOneLine ? current : fitsOnOneLine
                  );
                }}
              >
                {item.title}
                <Text style={[styles.inlineTitleLength, { color: colors.textSecondary }]}>
                  {` · ${inlineLengthText}`}
                </Text>
              </Text>
            </View>
          ) : null}
          <Text style={[styles.rowCompactTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
            {showInlineTitleLength && inlineLengthText ? (
              <Text style={[styles.inlineTitleLength, { color: colors.textSecondary }]}>
                {` · ${inlineLengthText}`}
              </Text>
            ) : null}
          </Text>
          <View style={styles.rowCompactMeta}>
            <View style={styles.rowCompactMetaIcon}>{renderSubtitleLeadingVisual()}</View>
            <View style={[styles.rowCompactMetaDot, { backgroundColor: contentColor }]} />
            <Text
              style={[styles.rowCompactMetaText, { color: colors.textSecondary }]}
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
    minHeight: STACK_TITLE_HEIGHT,
    marginBottom: Spacing.xs,
  },
  rowCompactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  rowCompactMetaIcon: {
    width: IconSizes.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowCompactMetaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  subtitleAvatar: {
    width: IconSizes.xs,
    height: IconSizes.xs,
    borderRadius: Radius.full,
  },
  rowCompactMetaText: {
    ...Typography.bodySmall,
    flex: 1,
  },

  rowFeaturedCard: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowFeaturedWrapper: {
    width: '100%',
    height: 56,
  },
  rowFeaturedThumbnailContainer: {
    width: 56,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowFeaturedThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  rowFeaturedContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.md,
  },
  rowFeaturedTitle: {
    ...Typography.labelSmallPlain,
    fontWeight: '600',
  },

  stackCard: {
    width: 200,
    height: STACK_CARD_HEIGHT,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  stackImage: {
    width: '100%',
    height: STACK_IMAGE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackContent: {
    flex: 1,
    padding: Spacing.md,
  },
  stackTitle: {
    ...Typography.bodyMedium,
    fontWeight: '500',
    minHeight: STACK_TITLE_HEIGHT,
    marginBottom: Spacing.xs,
  },
  inlineTitleLength: {
    ...Typography.bodySmall,
  },
  inlineTitleMeasurement: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  stackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stackMetaIcon: {
    width: IconSizes.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stackTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  stackSource: {
    ...Typography.bodySmall,
    flex: 1,
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
