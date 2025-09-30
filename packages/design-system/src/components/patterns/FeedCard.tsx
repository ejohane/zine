import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet, Image } from 'react-native';
import { Card, Chip, Button } from 'heroui-native';

export interface FeedCardProps {
  id: string;
  title: string;
  description?: string;
  url: string;
  platform: 'spotify' | 'youtube' | 'apple' | 'google' | 'rss';
  thumbnail?: string;
  creator?: string;
  subscriberCount?: number;
  episodeCount?: number;
  lastUpdated?: Date | string;
  updateFrequency?: 'daily' | 'weekly' | 'monthly' | 'irregular';
  isSubscribed?: boolean;
  isActive?: boolean;
  categories?: string[];
  onSubscribe?: (id: string) => void;
  onUnsubscribe?: (id: string) => void;
  onRefresh?: (id: string) => void;
  onView?: (id: string) => void;
}

const getPlatformIcon = (platform: string) => {
  switch (platform) {
    case 'spotify':
      return '🎵';
    case 'youtube':
      return '📺';
    case 'apple':
      return '🍎';
    case 'google':
      return '🔍';
    case 'rss':
      return '📡';
    default:
      return '📻';
  }
};

const formatSubscriberCount = (count?: number) => {
  if (!count) return '';
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M subscribers`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K subscribers`;
  }
  return `${count} subscribers`;
};

export const FeedCard: React.FC<FeedCardProps> = ({
  id,
  title,
  description,
  url,
  platform,
  thumbnail,
  creator,
  subscriberCount,
  episodeCount,
  lastUpdated,
  updateFrequency,
  isSubscribed,
  isActive = true,
  categories,
  onSubscribe,
  onUnsubscribe,
  onRefresh,
  onView,
}) => {
  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : undefined;

  const handleSubscriptionToggle = () => {
    if (isSubscribed && onUnsubscribe) {
      onUnsubscribe(id);
    } else if (!isSubscribed && onSubscribe) {
      onSubscribe(id);
    }
  };

  const handleOpenUrl = () => {
    Linking.openURL(url);
  };

  return (
    <TouchableOpacity 
      onPress={() => onView?.(id)}
      activeOpacity={onView ? 0.7 : 1}
      disabled={!onView}
    >
      <Card>
        <View style={[styles.cardContent, !isActive && styles.inactiveCard]}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.thumbnailContainer}>
                {thumbnail ? (
                  <Image
                    source={{ uri: thumbnail }}
                    style={styles.thumbnail}
                  />
                ) : (
                  <View style={styles.placeholderThumbnail}>
                    <Text style={styles.placeholderIcon}>{getPlatformIcon(platform)}</Text>
                  </View>
                )}
                {!isActive && (
                  <View style={styles.inactiveBadge}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Inactive</Text>
                    </View>
                  </View>
                )}
              </View>
              
              <View style={styles.headerInfo}>
                <View style={styles.titleRow}>
                  <View style={styles.titleContainer}>
                    <Text style={styles.title} numberOfLines={1}>
                      {title}
                    </Text>
                    {creator && (
                      <Text style={styles.creator}>
                        by {creator}
                      </Text>
                    )}
                  </View>
                  
                  <View style={styles.chipContainer}>
                    <Chip size="sm">
                      {platform}
                    </Chip>
                  </View>
                </View>
              </View>
            </View>
          </View>
          
          <View style={styles.body}>
            {description && (
              <Text style={styles.description} numberOfLines={2}>
                {description}
              </Text>
            )}
            
            <View style={styles.metadataRow}>
              {subscriberCount !== undefined && (
                <Text style={styles.metadata}>
                  {formatSubscriberCount(subscriberCount)}
                </Text>
              )}
              {episodeCount !== undefined && (
                <Text style={styles.metadata}>
                  {episodeCount} episodes
                </Text>
              )}
              {updateFrequency && (
                <View style={styles.frequencyChip}>
                  <Chip size="sm">
                    Updates {updateFrequency}
                  </Chip>
                </View>
              )}
            </View>
            
            {categories && categories.length > 0 && (
              <View style={styles.categoriesContainer}>
                {categories.map((category) => (
                  <View key={category} style={styles.category}>
                    <Chip size="sm">
                      {category}
                    </Chip>
                  </View>
                ))}
              </View>
            )}
            
            <View style={styles.footer}>
              <View style={styles.actions}>
                {(onSubscribe || onUnsubscribe) && (
                  <Button
                    size="sm"
                    onPress={handleSubscriptionToggle}
                  >
                    {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                  </Button>
                )}
                
                {onRefresh && (
                  <TouchableOpacity onPress={() => onRefresh(id)} style={styles.refreshButton}>
                    <Text style={styles.refreshIcon}>🔄</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              <View style={styles.footerRight}>
                {lastUpdated && (
                  <Text style={styles.updatedText}>
                    Updated {formattedDate}
                  </Text>
                )}
                
                <TouchableOpacity onPress={handleOpenUrl}>
                  <Text style={styles.linkText}>
                    View 🔗
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContent: {
    padding: 16,
  },
  inactiveCard: {
    opacity: 0.6,
  },
  header: {
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 16,
  },
  thumbnailContainer: {
    position: 'relative',
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  placeholderThumbnail: {
    width: 64,
    height: 64,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 24,
  },
  inactiveBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  headerInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
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
  body: {
    paddingTop: 0,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metadata: {
    fontSize: 14,
    color: '#999',
  },
  frequencyChip: {
    // Chip wrapper
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 12,
  },
  category: {
    marginRight: 4,
    marginBottom: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  refreshButton: {
    padding: 8,
  },
  refreshIcon: {
    fontSize: 20,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  updatedText: {
    fontSize: 14,
    color: '#999',
  },
  linkText: {
    fontSize: 14,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  badge: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});