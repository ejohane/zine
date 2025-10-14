import { useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Bookmark } from '../types/bookmark';
import { useTheme } from '../contexts/theme';
import { PlatformIcon } from '../lib/platformIcons';

interface BookmarkPreviewProps {
  preview?: Bookmark | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onOpenExisting?: (bookmarkId: string) => void;
}

export function BookmarkPreview({ preview, isLoading, error, onRetry, onOpenExisting }: BookmarkPreviewProps) {
  const [imageError, setImageError] = useState(false);
  const { colors } = useTheme();

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <View style={[styles.loadingThumbnail, { backgroundColor: colors.secondary }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <View style={styles.contentContainer}>
          <View style={[styles.loadingTitle, { backgroundColor: colors.secondary }]} />
          <View style={[styles.loadingDescription, { backgroundColor: colors.secondary }]} />
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer, { backgroundColor: colors.destructive + '10' }]}>
        <View style={styles.errorContent}>
          <View style={[styles.errorIconWrapper, { backgroundColor: colors.destructive + '20' }]}>
            <Feather name="alert-circle" size={24} color={colors.destructive} />
          </View>
          <View style={styles.errorTextContainer}>
            <Text style={[styles.errorTitle, { color: colors.destructive }]}>Preview Failed</Text>
            <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>{error}</Text>
          </View>
        </View>
        {onRetry && (
          <TouchableOpacity 
            onPress={onRetry} 
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Feather name="refresh-cw" size={16} color={colors.primaryForeground || '#fff'} />
            <Text style={[styles.retryText, { color: colors.primaryForeground || '#fff' }]}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Success state with preview
  if (preview) {
    // Get platform-specific color
    const platformColor = (() => {
      switch (preview.source) {
        case 'youtube': return '#FF0000';
        case 'spotify': return '#1DB954';
        case 'twitter':
        case 'x': return '#000000';
        case 'substack': return '#FF6719';
        default: return colors.primary;
      }
    })();
    
    // Format duration if available
    const duration = preview.videoMetadata?.duration || preview.podcastMetadata?.duration;
    const formattedDuration = duration ? formatDuration(duration) : null;

    const existingBookmarkId = preview.existingBookmarkId;

    return (
      <View style={[styles.previewCard, { backgroundColor: colors.card }]}>
        {/* Thumbnail Section */}
        {preview.thumbnailUrl && !imageError ? (
          <View style={styles.thumbnailWrapper}>
            <Image
              source={{ uri: preview.thumbnailUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
            {/* Duration badge for video/podcast */}
            {formattedDuration && (
              <View style={[styles.durationBadge, { backgroundColor: 'rgba(0, 0, 0, 0.7)' }]}>
                <Text style={styles.durationText}>{formattedDuration}</Text>
              </View>
            )}
            {/* Play button overlay for media content */}
            {(preview.contentType === 'video' || preview.contentType === 'podcast') && (
              <View style={styles.playButtonOverlay}>
                <View style={styles.playButton}>
                  <Feather name="play" size={24} color="#fff" style={styles.playIcon} />
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.secondary }]}>
            <Feather name="image" size={32} color={colors.mutedForeground} />
          </View>
        )}
        
        {/* Content Section */}
        <View style={styles.contentContainer}>
          {/* Title */}
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
            {preview.title || 'Untitled'}
          </Text>

          {/* Platform and Creator Info */}
          <View style={styles.metaRow}>
            <View style={styles.platformContainer}>
              <PlatformIcon source={preview.source} size={16} color={platformColor} />
              <Text style={[styles.source, { color: colors.mutedForeground }]}>
                {preview.creator?.name || 
                 (preview.url ? new URL(preview.url).hostname.replace('www.', '') : 'Unknown')}
              </Text>
            </View>
          </View>

          {/* Description */}
          {preview.description && (
            <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
              {preview.description}
            </Text>
          )}

          {/* Content Type Badge */}
          {preview.contentType && preview.contentType !== 'link' && (
            <View style={styles.badgeContainer}>
              <View style={[styles.contentTypeBadge, { backgroundColor: platformColor + '20' }]}>
                <Text style={[styles.contentTypeText, { color: platformColor }]}>
                  {preview.contentType.charAt(0).toUpperCase() + preview.contentType.slice(1)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {existingBookmarkId && onOpenExisting && (
          <TouchableOpacity
            onPress={() => onOpenExisting(existingBookmarkId)}
            style={[styles.duplicateHint, { backgroundColor: colors.secondary }]}
            activeOpacity={0.8}
          >
            <Feather name="check-circle" size={18} color={colors.primary} />
            <View style={styles.duplicateHintTextContainer}>
              <Text style={[styles.duplicateHintTitle, { color: colors.foreground }]}>Already saved</Text>
              <Text style={[styles.duplicateHintSubtitle, { color: colors.mutedForeground }]}>Open existing bookmark</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return null;
}

// Helper function to format duration in seconds to MM:SS or HH:MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  
  // Loading styles
  loadingThumbnail: {
    width: '100%',
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    height: 20,
    borderRadius: 4,
    marginBottom: 8,
    width: '80%',
  },
  loadingDescription: {
    height: 16,
    borderRadius: 4,
    width: '60%',
  },
  
  // Error styles
  errorContainer: {
    padding: 20,
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  errorTextContainer: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 6,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Preview card styles
  previewCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  thumbnailWrapper: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    marginLeft: 3,
  },
  
  // Content styles
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  platformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  source: {
    fontSize: 14,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  badgeContainer: {
    flexDirection: 'row',
    marginTop: 12,
  },
  contentTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  contentTypeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  duplicateHint: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  duplicateHintTextContainer: {
    flex: 1,
    gap: 2,
  },
  duplicateHintTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  duplicateHintSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
});
