/**
 * ContentCard Component
 *
 * Compact content card with thumbnail for podcasts, videos, etc.
 */

import { Image } from 'expo-image';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

import { BookmarkIcon, HeadphonesIcon, VideoIcon, ArticleIcon } from '@/components/icons';
import { PressableScale } from './pressable-scale';
import type { Colors } from '@/constants/theme';
import { Typography, Spacing, Radius } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.42;

export type LocalContentType = 'podcast' | 'video' | 'article' | 'post';
export type LocalProvider = 'youtube' | 'spotify' | 'substack' | 'twitter' | 'pocket';

export interface ContentItem {
  id: string;
  title: string;
  subtitle?: string;
  source: string;
  provider: LocalProvider;
  type: LocalContentType;
  thumbnailUrl?: string;
  duration?: string;
  progress?: number;
  publishedAt?: string;
  gradient?: [string, string];
}

export interface ContentCardProps {
  item: ContentItem;
  colors: typeof Colors.light;
  index: number;
  variant?: 'default' | 'square' | 'wide';
  onPress?: () => void;
}

/**
 * Get the appropriate icon for a content type
 */
export function getContentIcon(type: LocalContentType, size = 16, color = '#fff') {
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

export function ContentCard({
  item,
  colors,
  index,
  variant = 'default',
  onPress,
}: ContentCardProps) {
  const isSquare = variant === 'square' || item.type === 'podcast';
  const cardWidth = variant === 'wide' ? CARD_WIDTH * 1.3 : CARD_WIDTH;
  const aspectRatio = isSquare ? 1 : 16 / 10;

  return (
    <PressableScale
      delay={index * 50}
      style={[styles.contentCard, { width: cardWidth }]}
      onPress={onPress}
    >
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

const styles = StyleSheet.create({
  contentCard: {
    width: CARD_WIDTH,
  },
  contentThumbnail: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
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
});
