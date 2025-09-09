import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, Image } from 'react-native';
import { Card, Chip, Button } from 'heroui-native';

export interface SubscriptionItemProps {
  id: string;
  title: string;
  creator?: string;
  platform: 'spotify' | 'youtube' | 'apple' | 'google';
  thumbnail?: string;
  duration?: number; // in seconds
  progress?: number; // percentage 0-100
  episodeNumber?: number;
  seasonNumber?: number;
  publishedAt?: Date | string;
  isNew?: boolean;
  isPlaying?: boolean;
  onPlay?: (id: string) => void;
  onPause?: (id: string) => void;
  onMarkAsPlayed?: (id: string) => void;
  onAddToQueue?: (id: string) => void;
  url?: string;
}

const formatDuration = (seconds?: number) => {
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const getPlatformIcon = (platform: string) => {
  switch (platform) {
    case 'spotify':
      return '🎧';
    case 'youtube':
      return '▶️';
    case 'apple':
      return '🎙️';
    case 'google':
      return '📻';
    default:
      return '🎵';
  }
};

export const SubscriptionItem: React.FC<SubscriptionItemProps> = ({
  id,
  title,
  creator,
  platform,
  thumbnail,
  duration,
  progress = 0,
  episodeNumber,
  seasonNumber,
  publishedAt,
  isNew,
  isPlaying,
  onPlay,
  onPause,
  onMarkAsPlayed,
  onAddToQueue,
  url,
}) => {
  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : undefined;

  const handlePlayPause = () => {
    if (isPlaying && onPause) {
      onPause(id);
    } else if (!isPlaying && onPlay) {
      onPlay(id);
    }
  };

  const handleOpenUrl = () => {
    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <Card>
      <View style={[styles.cardContent, isPlaying && styles.playingCard]}>
        <View style={styles.contentRow}>
          <View style={styles.thumbnailContainer}>
            {thumbnail ? (
              <Image
                source={{ uri: thumbnail }}
                style={[styles.thumbnail, isPlaying && styles.playingThumbnail]}
              />
            ) : (
              <View style={styles.placeholderThumbnail}>
                <Text style={styles.placeholderIcon}>{getPlatformIcon(platform)}</Text>
              </View>
            )}
            {isNew && (
              <View style={styles.newBadge}>
                <Chip size="sm" color="danger">
                  NEW
                </Chip>
              </View>
            )}
          </View>
          
          <View style={styles.contentColumn}>
            <View style={styles.titleRow}>
              <View style={styles.titleContainer}>
                <Text style={styles.title} numberOfLines={2}>
                  {title}
                </Text>
                {creator && (
                  <Text style={styles.creator}>
                    {creator}
                  </Text>
                )}
              </View>
              
              <View style={styles.chipContainer}>
                <Chip size="sm">
                  {platform}
                </Chip>
              </View>
            </View>
            
            <View style={styles.metadataRow}>
              {episodeNumber && (
                <Text style={styles.metadata}>
                  {seasonNumber && `S${seasonNumber} `}
                  E{episodeNumber}
                </Text>
              )}
              {duration && <Text style={styles.metadata}>{formatDuration(duration)}</Text>}
              {formattedDate && <Text style={styles.metadata}>{formattedDate}</Text>}
            </View>
            
            {progress > 0 && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill,
                      { width: `${progress}%` },
                      progress === 100 && styles.progressComplete
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {progress}% complete
                </Text>
              </View>
            )}
            
            <View style={styles.actions}>
              {(onPlay || onPause) && (
                <Button
                  size="sm"
                  onPress={handlePlayPause}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </Button>
              )}
              
              {onMarkAsPlayed && progress < 100 && (
                <Button
                  size="sm"
                  onPress={() => onMarkAsPlayed(id)}
                >
                  Mark as Played
                </Button>
              )}
              
              {onAddToQueue && (
                <Button
                  size="sm"
                  onPress={() => onAddToQueue(id)}
                >
                  Add to Queue
                </Button>
              )}
              
              {url && (
                <TouchableOpacity onPress={handleOpenUrl} style={styles.linkButton}>
                  <Text style={styles.linkText}>
                    Open 🔗
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContent: {
    padding: 16,
  },
  playingCard: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  contentRow: {
    flexDirection: 'row',
    gap: 16,
  },
  thumbnailContainer: {
    position: 'relative',
  },
  thumbnail: {
    width: 96,
    height: 96,
    borderRadius: 8,
  },
  playingThumbnail: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  placeholderThumbnail: {
    width: 96,
    height: 96,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 30,
  },
  newBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  contentColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  creator: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  chipContainer: {
    flexShrink: 0,
  },
  metadataRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  metadata: {
    fontSize: 14,
    color: '#999',
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linkButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 'auto',
  },
  linkText: {
    fontSize: 14,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  progressComplete: {
    backgroundColor: '#4CD964',
  },
});