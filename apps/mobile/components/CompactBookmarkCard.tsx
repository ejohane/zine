import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { formatDistanceToNow } from '../lib/dateUtils';
import { useTheme } from '../contexts/theme';
import { PlatformIcon } from '../lib/platformIcons';

type SupportedContentType = 'video' | 'podcast' | 'article' | 'post' | 'link';

interface CompactBookmarkCardProps {
  bookmark: {
    id: string;
    title: string;
    thumbnailUrl?: string | null;
    contentType?: SupportedContentType;
    publishedAt?: string | number | null;
    videoMetadata?: { duration?: number | null } | null;
    podcastMetadata?: { duration?: number | null } | null;
    duration?: number | null;
    creator?: { avatarUrl?: string | null } | null;
    metrics?: { durationSeconds?: number | null } | null;
    source?: string | null;
    alternateLinks?: Array<{ provider?: string | null; url: string }>;
  };
  onPress?: () => void;
}

export function CompactBookmarkCard({
  bookmark,
  onPress,
}: CompactBookmarkCardProps) {
  const { colors } = useTheme();
  
  const getContentTypeIcon = () => {
    switch (bookmark.contentType) {
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
  const duration =
    bookmark.duration ??
    bookmark.videoMetadata?.duration ??
    bookmark.podcastMetadata?.duration ??
    bookmark.metrics?.durationSeconds ??
    undefined;

  const thumbnailUri = React.useMemo(() => {
    if (bookmark.thumbnailUrl && bookmark.thumbnailUrl.trim().length > 0) {
      return bookmark.thumbnailUrl;
    }
    const fallback = bookmark.creator?.avatarUrl;
    if (fallback && fallback.trim().length > 0) {
      return fallback;
    }
    return undefined;
  }, [bookmark.thumbnailUrl, bookmark.creator?.avatarUrl]);

  const multiPlatformProviders = React.useMemo(() => {
    const providers = new Set<string>();
    if (bookmark.source) {
      providers.add(bookmark.source);
    }
    (bookmark.alternateLinks ?? []).forEach((link) => {
      if (link?.provider) {
        providers.add(link.provider);
      }
    });
    return Array.from(providers);
  }, [bookmark.source, bookmark.alternateLinks]);

  const showMultiPlatform = multiPlatformProviders.length > 1;

  return (
    <TouchableOpacity
      style={[styles.compactCard, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.compactThumbnailContainer}>
        {thumbnailUri ? (
          <Image
            source={{ 
              uri: thumbnailUri,
              cache: 'force-cache'
            }}
            style={styles.compactThumbnail}
            resizeMode="cover"
            onError={() => {}}
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

      <View style={styles.compactInfo}>
        <Text style={[styles.compactTitle, { color: colors.foreground }]} numberOfLines={2}>
          {bookmark.title}
        </Text>
        
        <View style={styles.compactMeta}>
          <Feather 
            name={contentIcon.name as any} 
            size={14} 
            color={contentIcon.color} 
          />
          {bookmark.publishedAt && (
            <Text style={[styles.compactDate, { color: colors.mutedForeground }]}>
              {formatDistanceToNow(bookmark.publishedAt)}
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
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
  compactThumbnailContainer: {
    width: 60,
    height: 60,
    position: 'relative',
  },
  compactThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  compactThumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
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
    borderRadius: 4,
  },
  compactDurationText: {
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
  compactInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  compactTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 20,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactDate: {
    fontSize: 12,
  },
});

export const MemoizedCompactBookmarkCard = React.memo(CompactBookmarkCard);
