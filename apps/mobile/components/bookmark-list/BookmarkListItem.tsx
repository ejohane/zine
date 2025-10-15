import React, { useRef, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/theme';
import { formatDistanceToNow } from '../../lib/dateUtils';
import { OptimizedBookmarkImage } from '../OptimizedBookmarkImage';
import { ContentTypeIcon } from '../../lib/platformIcons';
import { CARD_STYLES, BORDER_RADIUS, SPACING, ANIMATIONS } from './constants';
import type { BookmarkListItemProps } from './types';

function formatDuration(seconds?: number | null): string | null {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function BookmarkListItemComponent({
  bookmark,
  variant = 'compact',
  onPress,
  showThumbnail = true,
  showMetadata = true,
  showPublishDate = true,
  showPlatformIcon = true,
  enableHaptics = true,
}: BookmarkListItemProps) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const styles = useMemo(() => createStyles(colors, variant), [colors, variant]);

  const duration = useMemo(() => {
    return (
      bookmark.videoMetadata?.duration ??
      bookmark.podcastMetadata?.duration ??
      null
    );
  }, [bookmark]);

  const thumbnailUri = useMemo(() => {
    if (bookmark.thumbnailUrl && bookmark.thumbnailUrl.trim().length > 0) {
      return bookmark.thumbnailUrl;
    }
    const fallback = bookmark.creator?.avatarUrl;
    if (fallback && fallback.trim().length > 0) {
      return fallback;
    }
    return undefined;
  }, [bookmark.thumbnailUrl, bookmark.creator?.avatarUrl]);

  const handlePressIn = () => {
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Animated.spring(scale, {
      toValue: 0.98,
      useNativeDriver: true,
      ...ANIMATIONS.spring,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      ...ANIMATIONS.spring,
    }).start();
  };

  const handlePress = () => {
    onPress?.(bookmark.id);
  };

  if (variant === 'compact') {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          style={styles.compactCard}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={handlePress}
        >
          {showThumbnail && (
            <View style={styles.compactThumbnailContainer}>
              {thumbnailUri ? (
                <OptimizedBookmarkImage
                  url={thumbnailUri}
                  contentType={bookmark.contentType}
                  style={styles.compactThumbnail}
                />
              ) : (
                <View style={[styles.compactThumbnailPlaceholder, { backgroundColor: colors.secondary }]}>
                  <Feather name="image" size={20} color={colors.mutedForeground} />
                </View>
              )}
              {duration && (
                <View style={styles.compactDurationBadge}>
                  <Text style={styles.compactDurationText}>{formatDuration(duration)}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.compactInfo}>
            <Text style={[styles.compactTitle, { color: colors.foreground }]} numberOfLines={2}>
              {bookmark.title}
            </Text>

            {showMetadata && (
              <View style={styles.compactMeta}>
                {showPlatformIcon && (
                  <ContentTypeIcon
                    contentType={bookmark.contentType}
                    size={14}
                    color={colors.mutedForeground}
                  />
                )}
                {bookmark.creator?.name && (
                  <Text style={[styles.compactCreator, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {bookmark.creator.name}
                  </Text>
                )}
              </View>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return null;
}

function createStyles(colors: any, variant: 'compact' | 'comfortable' | 'media-rich') {
  const variantStyles = CARD_STYLES[variant];

  return StyleSheet.create({
    compactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      height: variantStyles.height,
      padding: variantStyles.padding,
      borderRadius: 0,
      backgroundColor: colors.card,
      gap: variantStyles.gap,
    },
    compactThumbnailContainer: {
      width: variantStyles.thumbnailSize,
      height: variantStyles.thumbnailSize,
      position: 'relative',
    },
    compactThumbnail: {
      width: variantStyles.thumbnailSize,
      height: variantStyles.thumbnailSize,
      borderRadius: variantStyles.thumbnailRadius,
    },
    compactThumbnailPlaceholder: {
      width: variantStyles.thumbnailSize,
      height: variantStyles.thumbnailSize,
      borderRadius: variantStyles.thumbnailRadius,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactDurationBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.small,
    },
    compactDurationText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '600',
    },
    compactInfo: {
      flex: 1,
      gap: SPACING.sm,
    },
    compactTitle: {
      fontSize: variantStyles.titleSize,
      fontWeight: variantStyles.titleWeight,
      lineHeight: variantStyles.titleLineHeight,
    },
    compactMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    compactCreator: {
      fontSize: variantStyles.metadataSize,
      fontWeight: '500',
      flex: 1,
    },
    compactDate: {
      fontSize: variantStyles.metadataSize,
    },
  });
}

export const BookmarkListItem = React.memo(BookmarkListItemComponent);
