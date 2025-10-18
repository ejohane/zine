import * as React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { Play } from 'lucide-react-native';
import type { Bookmark } from '@zine/shared';
import { formatDuration, formatShortDate, formatPublicationDate } from '../lib/dateUtils';
import { PlatformIcon } from '../lib/platformIcons';
import { OptimizedBookmarkImage } from './OptimizedBookmarkImage';
import { useTheme } from '../contexts/theme';

interface MediaRichBookmarkCardProps {
  bookmark: Bookmark;
  onPress?: () => void;
  onOpenLink?: () => void;
  enableHaptics?: boolean;
}

export const MediaRichBookmarkCard = React.memo<MediaRichBookmarkCardProps>(({ 
  bookmark, 
  onPress,
  onOpenLink,
  enableHaptics = true
}) => {
  const router = useRouter();
  const { colors } = useTheme();
  
  // Handle card press - navigate to detail view or article reader
  const handlePress = React.useCallback(() => {
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (onPress) {
      onPress();
    } else {
      // For articles, navigate to article reader
      if (bookmark.contentType === 'article') {
        router.push(`/article-reader?bookmarkId=${bookmark.id}`);
      } else {
        // For other content, navigate to bookmark detail screen
        router.push(`/bookmark/${bookmark.id}`);
      }
    }
  }, [bookmark.id, bookmark.contentType, onPress, router, enableHaptics]);
  
  // Handle open link/more options
  const handleOpenLink = React.useCallback(async () => {
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    if (onOpenLink) {
      onOpenLink();
    } else {
      try {
        const url = bookmark.originalUrl || bookmark.url;
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          // Navigate to bookmark detail page after opening link
          router.push(`/bookmark/${bookmark.id}`);
        }
      } catch (error) {
        console.error('Error opening URL:', error);
      }
    }
  }, [bookmark.originalUrl, bookmark.url, bookmark.id, onOpenLink, router, enableHaptics]);
  
  // Get duration/reading time based on content type
  const displayTime = React.useMemo(() => {
    if (bookmark.contentType === 'article') {
      // Show reading time for articles
      return bookmark.articleMetadata?.readingTime
        ? `${bookmark.articleMetadata.readingTime} min read`
        : null;
    }

    // Show duration for videos/podcasts
    const duration =
      bookmark.videoMetadata?.duration ??
      bookmark.podcastMetadata?.duration ??
      bookmark.metrics?.durationSeconds ??
      bookmark.duration ??
      null;
    return duration ? formatDuration(duration) : null;
  }, [bookmark.contentType, bookmark.articleMetadata, bookmark.videoMetadata, bookmark.podcastMetadata, bookmark.metrics, bookmark.duration]);

  // Get author/source name
  const authorName = bookmark.contentType === 'article'
    ? bookmark.creator?.name || bookmark.articleMetadata?.authorName || 'Unknown Author'
    : bookmark.creator?.name || bookmark.source || 'Unknown';

  // Check if media content (show play button)
  const isMediaContent = bookmark.contentType === 'video' || bookmark.contentType === 'podcast';
  
  // Platform-specific colors and names
  const getPlatformColor = (source?: string) => {
    switch (source) {
      case 'youtube': return '#FF0000';
      case 'spotify': return '#1DB954';
      case 'twitter':
      case 'x': return '#000000';
      default: return '#FF6B35';
    }
  };
  
  const getPlatformName = (source?: string) => {
    switch (source) {
      case 'youtube': return 'YouTube';
      case 'spotify': return 'Spotify';
      default: return source || '';
    }
  };
  
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

  return (
    <Pressable
      onPress={handlePress}
      className="active:opacity-90"
    >
      <View style={{ width: 300, height: 240, borderRadius: 12, overflow: 'hidden', marginRight: 12, backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }}>
        {/* Media Preview Section */}
        <View style={{ width: '100%', height: 169, backgroundColor: '#e5e7eb', position: 'relative' }}>
          {thumbnailUri ? (
            <OptimizedBookmarkImage
              url={thumbnailUri}
              contentType={bookmark.contentType}
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          ) : (
            <View className="w-full h-full bg-gray-200 items-center justify-center">
              <PlatformIcon source={bookmark.source} size={32} />
            </View>
          )}
          
          {/* Play button overlay for media content */}
          {isMediaContent && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'box-none' }}>
              <Pressable
                onPress={(e) => {
                  handleOpenLink();
                }}
                className="active:opacity-80"
                hitSlop={8}
              >
                <View style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 999, padding: 12 }}>
                  <Play fill="#FF6B35" color="#FF6B35" size={24} />
                </View>
              </Pressable>
            </View>
          )}
          
          {/* Duration/Reading time badge */}
          {displayTime && (
            <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0, 0, 0, 0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: 'white', fontSize: 11, fontWeight: '500' }}>{displayTime}</Text>
            </View>
          )}

          {/* Paywall indicator for articles */}
          {bookmark.contentType === 'article' && bookmark.articleMetadata?.isPaywalled && (
            <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255, 193, 7, 0.9)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: '#000', fontSize: 10, fontWeight: '600' }}>🔒 Limited</Text>
            </View>
          )}
        </View>
        
        {/* Content Section */}
        <View style={{ padding: 12, height: 71 }}>
          {/* Title */}
          <Text 
            style={{ fontSize: 14, fontWeight: '600', marginBottom: 6, lineHeight: 18, color: colors.foreground }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {bookmark.title}
          </Text>
          
          {/* Author Info and Publish Date */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Creator on the left */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              {bookmark.creator?.avatarUrl ? (
                <Image
                  source={{ uri: bookmark.creator.avatarUrl }}
                  style={{ width: 16, height: 16, borderRadius: 8 }}
                  onError={() => {}}
                />
              ) : null}
              <Text style={{ fontSize: 12, flex: 1, color: colors.foreground }} numberOfLines={1}>
                {authorName}
              </Text>
            </View>
            
            {/* Publish date on the right */}
            {bookmark.publishedAt && (
              <Text style={{ fontSize: 12, marginLeft: 8, color: colors.mutedForeground }}>
                {bookmark.contentType === 'article'
                  ? formatPublicationDate(bookmark.publishedAt)
                  : formatShortDate(bookmark.publishedAt)
                }
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return prevProps.bookmark.id === nextProps.bookmark.id &&
         prevProps.bookmark.updatedAt === nextProps.bookmark.updatedAt &&
         prevProps.enableHaptics === nextProps.enableHaptics;
});

MediaRichBookmarkCard.displayName = 'MediaRichBookmarkCard';
