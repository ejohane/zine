import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { formatDistanceToNow } from '../lib/dateUtils';
import { useTheme } from '../contexts/theme';
import { PlatformIcon } from '../lib/platformIcons';

type SupportedContentType = 'video' | 'podcast' | 'article' | 'post' | 'link';

/**
 * Normalized data structure for content cards
 * Used by both feed items and bookmarks
 */
export interface ContentCardData {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  contentType?: SupportedContentType;
  publishedAt?: string | number | null;
  
  // Duration in seconds (for videos/podcasts) or reading time in minutes (for articles)
  duration?: number | null;
  
  // Creator information
  creator?: {
    name?: string;
    avatarUrl?: string | null;
  } | null;
  
  // Additional metadata
  metadata?: {
    isPaywalled?: boolean | null;
    readingTime?: number | null;
  } | null;
  
  // Multi-platform support (e.g., content available on multiple services)
  source?: string | null;
  alternateLinks?: Array<{ provider?: string | null; url: string }>;
}

interface ContentCardProps {
  data: ContentCardData;
  onPress?: () => void;
}

export function ContentCard({ data, onPress }: ContentCardProps) {
  const { colors } = useTheme();
  
  const getContentTypeIcon = () => {
    switch (data.contentType) {
      case 'video':
        return { name: 'play-circle', color: '#FF0000' };
      case 'podcast':
        return { name: 'mic', color: '#1DB954' };
      case 'article':
      case 'post':
        return { name: 'file-text', color: colors.primary };
      default:
        return { name: 'bookmark', color: colors.mutedForeground };
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const contentIcon = getContentTypeIcon();

  // Get display duration/reading time based on content type
  const displayDuration = React.useMemo(() => {
    if (data.contentType === 'article') {
      // Show reading time for articles
      const readingTime = data.metadata?.readingTime;
      return readingTime ? `${readingTime} min read` : null;
    }

    // Show duration for videos/podcasts
    return data.duration ? formatDuration(data.duration) : null;
  }, [data.contentType, data.metadata, data.duration]);

  const thumbnailUri = React.useMemo(() => {
    if (data.thumbnailUrl && data.thumbnailUrl.trim().length > 0) {
      return data.thumbnailUrl;
    }
    const fallback = data.creator?.avatarUrl;
    if (fallback && fallback.trim().length > 0) {
      return fallback;
    }
    return undefined;
  }, [data.thumbnailUrl, data.creator?.avatarUrl]);

  const multiPlatformProviders = React.useMemo(() => {
    const providers = new Set<string>();
    if (data.source) {
      providers.add(data.source);
    }
    (data.alternateLinks ?? []).forEach((link) => {
      if (link?.provider) {
        providers.add(link.provider);
      }
    });
    return Array.from(providers);
  }, [data.source, data.alternateLinks]);

  const showMultiPlatform = multiPlatformProviders.length > 1;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.thumbnailContainer}>
        {thumbnailUri ? (
          <Image
            source={{ 
              uri: thumbnailUri,
              cache: 'force-cache'
            }}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => {}}
          />
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.secondary }]}>
            <Feather name="image" size={20} color={colors.mutedForeground} />
          </View>
        )}
        {displayDuration && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{displayDuration}</Text>
          </View>
        )}
        {data.contentType === 'article' && data.metadata?.isPaywalled && (
          <View style={[styles.durationBadge, { backgroundColor: 'rgba(255, 193, 7, 0.9)', top: 4 }]}>
            <Text style={[styles.durationText, { color: '#000' }]}>🔒</Text>
          </View>
        )}
        {showMultiPlatform && (
          <View style={[styles.multiPlatformChip, { backgroundColor: colors.background }]}>
            {multiPlatformProviders.slice(0, 2).map((provider) => (
              <PlatformIcon key={provider} source={(provider as any) ?? 'web'} size={12} />
            ))}
            {multiPlatformProviders.length > 2 && (
              <Text style={[styles.multiPlatformMore, { color: colors.mutedForeground }]}>+{multiPlatformProviders.length - 2}</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {data.title}
        </Text>
        
        <View style={styles.meta}>
          <Feather 
            name={contentIcon.name as any} 
            size={14} 
            color={contentIcon.color} 
          />
          {data.publishedAt && (
            <Text style={[styles.date, { color: colors.mutedForeground }]}>
              {formatDistanceToNow(data.publishedAt)}
            </Text>
          )}
        </View>
      </View>

      <Feather 
        name="chevron-right" 
        size={20} 
        color={colors.mutedForeground} 
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  thumbnailContainer: {
    width: 60,
    height: 60,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  multiPlatformChip: {
    position: 'absolute',
    top: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  multiPlatformMore: {
    fontSize: 10,
    fontWeight: '600',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  date: {
    fontSize: 12,
  },
});

export const MemoizedContentCard = React.memo(ContentCard);
