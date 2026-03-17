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

import { Typography, Spacing, Radius, IconSizes } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePrefetchItemDetail } from '@/hooks/use-prefetch';
import { formatDuration } from '@/lib/format';
import { getItemCardImageCandidates, normalizeItemCardImageUrl } from '@/lib/item-card-image';
import { getContentIcon, type ContentType, type Provider } from '@/lib/content-utils';

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
  const creatorImageUrl = normalizeItemCardImageUrl(item.creatorImageUrl);
  const mediaImageCandidates = getItemCardImageCandidates({
    thumbnailUrl: item.thumbnailUrl,
    creatorImageUrl: item.creatorImageUrl,
  });
  const [mediaImageCandidateIndex, setMediaImageCandidateIndex] = useState(0);
  const [subtitleAvatarFailed, setSubtitleAvatarFailed] = useState(false);

  const durationText = formatDuration(item.duration) || null;
  const readingTimeText =
    item.readingTimeMinutes && !item.duration ? `${item.readingTimeMinutes} min` : null;
  const inlineLengthText = durationText ?? readingTimeText;
  const mediaImageUrl = mediaImageCandidates[mediaImageCandidateIndex] ?? null;

  useEffect(() => {
    setMediaImageCandidateIndex(0);
  }, [item.id, item.thumbnailUrl, creatorImageUrl]);

  useEffect(() => {
    setSubtitleAvatarFailed(false);
  }, [item.id, creatorImageUrl]);

  const handleMediaImageError = () => {
    if (mediaImageUrl === creatorImageUrl) {
      setSubtitleAvatarFailed(true);
    }

    setMediaImageCandidateIndex((currentIndex) =>
      Math.min(currentIndex + 1, mediaImageCandidates.length)
    );
  };

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

    return getContentIcon(item.contentType, IconSizes.xs, colors.textSubheader);
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
          {mediaImageUrl ? (
            <Image
              source={{ uri: mediaImageUrl }}
              style={styles.coverImage}
              contentFit="cover"
              transition={mediaTransition}
              onError={handleMediaImageError}
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
          {mediaImageUrl ? (
            <Image
              source={{ uri: mediaImageUrl }}
              style={styles.stackImage}
              contentFit="cover"
              transition={mediaTransition}
              onError={handleMediaImageError}
            />
          ) : (
            <View style={[styles.stackImage, { backgroundColor: colors.surfaceRaised }]} />
          )}

          <View style={styles.stackContent}>
            <Text style={[styles.stackTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.stackMeta}>
              <View style={styles.stackMetaIcon}>{renderSubtitleLeadingVisual()}</View>
              <View style={styles.stackMetaTextGroup}>
                <View
                  style={[
                    styles.stackMetaCreatorContainer,
                    inlineLengthText ? styles.stackMetaCreatorContainerWithLength : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.stackSource,
                      styles.stackMetaCreator,
                      { color: colors.textSubheader },
                    ]}
                    numberOfLines={1}
                  >
                    {item.creator}
                  </Text>
                </View>
                {inlineLengthText ? (
                  <>
                    <View
                      style={[styles.stackTypeDot, { backgroundColor: colors.textSubheader }]}
                    />
                    <Text
                      style={[
                        styles.stackSource,
                        styles.stackMetaLength,
                        { color: colors.textSubheader },
                      ]}
                      numberOfLines={1}
                    >
                      {inlineLengthText}
                    </Text>
                  </>
                ) : null}
              </View>
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
            {mediaImageUrl ? (
              <Image
                source={{ uri: mediaImageUrl }}
                style={styles.rowFeaturedThumbnailImage}
                contentFit="cover"
                transition={mediaTransition}
                onError={handleMediaImageError}
              />
            ) : null}
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
          {mediaImageUrl ? (
            <Image
              source={{ uri: mediaImageUrl }}
              style={styles.rowCompactThumbnailImage}
              contentFit="cover"
              transition={mediaTransition}
              onError={handleMediaImageError}
            />
          ) : (
            <View
              style={[styles.rowCompactThumbnailImage, { backgroundColor: colors.surfaceRaised }]}
            />
          )}
        </View>

        <View style={styles.rowCompactContent}>
          <Text style={[styles.rowCompactTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={styles.rowCompactMeta}>
            <View style={styles.rowCompactMetaIcon}>{renderSubtitleLeadingVisual()}</View>
            <Text
              style={[
                styles.rowCompactMetaText,
                styles.rowCompactMetaCreator,
                { color: colors.textSubheader },
              ]}
              numberOfLines={1}
            >
              {item.creator}
            </Text>
            {inlineLengthText ? (
              <>
                <View
                  style={[styles.rowCompactMetaDot, { backgroundColor: colors.textSubheader }]}
                />
                <Text
                  style={[
                    styles.rowCompactMetaText,
                    styles.rowCompactMetaLength,
                    { color: colors.textSubheader },
                  ]}
                  numberOfLines={1}
                >
                  {inlineLengthText}
                </Text>
              </>
            ) : null}
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
    minWidth: 0,
  },
  rowCompactMetaIcon: {
    width: IconSizes.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowCompactMetaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    flexShrink: 0,
  },
  subtitleAvatar: {
    width: IconSizes.xs,
    height: IconSizes.xs,
    borderRadius: Radius.full,
  },
  rowCompactMetaText: {
    ...Typography.bodySmall,
  },
  rowCompactMetaCreator: {
    flexShrink: 1,
    minWidth: 0,
  },
  rowCompactMetaLength: {
    flexShrink: 0,
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
  stackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
  },
  stackMetaIcon: {
    width: IconSizes.xs,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stackMetaTextGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stackTypeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    flexShrink: 0,
  },
  stackSource: {
    ...Typography.bodySmall,
  },
  stackMetaCreatorContainer: {
    flexShrink: 1,
    minWidth: 0,
  },
  stackMetaCreatorContainerWithLength: {
    maxWidth: '70%',
  },
  stackMetaCreator: {
    minWidth: 0,
  },
  stackMetaLength: {
    flexShrink: 0,
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
